import logging
import re

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import ValidationError

from app.api.admin import router as admin_router
from app.api.admin_users import router as admin_users_router
from app.api.create import router as create_router

# Routers
from app.api.dashboard import router as dashboard_router
from app.api.imagine import router as imagine_router
from app.api.publish import _youtube_upload_from_disk
from app.api.publish import router as publish_router
from app.api.system import router as system_router
from app.core.settings import get_settings
from app.core.startup import lifespan, start_queue_worker, stop_queue_worker
from app.deps import dev_user

# Compatibility constants and helpers for tests
from app.services.seeding import (
    DEFAULT_ADMIN_EMAIL,
    DEFAULT_ADMIN_PASSWORD,
    TEST_USER_ACCOUNTS,
    TEST_USER_PASSWORD,
    bootstrap_default_admin,
)
from app.services.users import user_payload as _user_payload
from app.web import errors as error_handlers
from app.web.workspaces import router as workspaces_router
from modules.storage import project_path

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    # Decide docs exposure based on environment
    settings_initial = get_settings()
    docs_url = "/docs" if settings_initial.env == "dev" else None
    openapi_url = "/openapi.json" if settings_initial.env == "dev" else None

    app = FastAPI(
        title="Creator Toolkit",
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )

    class ContentTypeCharsetMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):  # type: ignore[override]
            response = await call_next(request)

            # Drop legacy, unnecessary headers (case-insensitive)
            drop_headers_ci = {"x-xss-protection", "expires", "x-frame-options"}
            for key in list(response.headers.keys()):
                if key.lower() in drop_headers_ci:
                    try:
                        del response.headers[key]
                    except Exception:
                        pass

            ct = response.headers.get("content-type")
            base = ct.split(";", 1)[0].strip().lower() if ct else ""
            is_html = base == "text/html"

            # Prefer Cache-Control for HTML; if missing, set a conservative default
            if is_html and not response.headers.get("cache-control"):
                response.headers["cache-control"] = "no-cache"

            # Ensure CSP has a frame-ancestors directive for HTML only
            if is_html:
                csp = response.headers.get("content-security-policy")
                if csp:
                    if "frame-ancestors" not in csp.lower():
                        response.headers["content-security-policy"] = csp.rstrip("; ") + "; frame-ancestors 'self'"
                else:
                    response.headers["content-security-policy"] = "frame-ancestors 'self'"

            # Normalize/ensure charset for textual content types
            if ct:
                needs_charset = base.startswith("text/") or base in (
                    "application/json",
                    "application/javascript",
                    "application/xml",
                )
                if "charset=" in ct:
                    ct_norm = re.sub(r"charset=([^;]+)", "charset=utf-8", ct, flags=re.I)
                    if ct_norm != ct:
                        response.headers["content-type"] = ct_norm
                elif needs_charset:
                    response.headers["content-type"] = f"{ct}; charset=utf-8"

            return response

    # Normalize/ensure charset in Content-Type for common textual responses
    app.add_middleware(ContentTypeCharsetMiddleware)

    # Exception handlers (unified error envelope)
    app.add_exception_handler(HTTPException, error_handlers.http_exception_handler)
    app.add_exception_handler(
        ValidationError, error_handlers.pydantic_validation_exception_handler
    )
    app.add_exception_handler(
        RequestValidationError, error_handlers.request_validation_exception_handler
    )
    app.add_exception_handler(Exception, error_handlers.generic_exception_handler)

    # Settings and static mounts
    settings = settings_initial
    # Validate safety for non-dev environments and ensure required dirs exist
    settings.validate_for_runtime()
    settings.ensure_dirs()
    app.state.settings = settings

    # Static (bundled) and user content (uploads/exports)
    app.mount("/static", StaticFiles(directory="static"), name="static")
    app.mount(
        "/content", StaticFiles(directory=settings.USER_CONTENT_DIR), name="content"
    )
    templates = Jinja2Templates(directory="templates")

    # Include API routers
    app.include_router(dashboard_router)
    app.include_router(imagine_router)
    app.include_router(create_router)
    app.include_router(publish_router)
    app.include_router(system_router)
    app.include_router(admin_router)
    app.include_router(admin_users_router)
    app.include_router(workspaces_router)

    # settings already attached above

    # Doc endpoints guarded by admin when not exposed globally
    if app.openapi_url is None:

        @app.get("/openapi.json", include_in_schema=False)
        def custom_openapi(user=Depends(dev_user)):
            return JSONResponse(app.openapi())

        @app.get("/docs", include_in_schema=False)
        def custom_docs(user=Depends(dev_user)):
            return get_swagger_ui_html(
                openapi_url="/openapi.json", title="Creator Toolkit API Docs"
            )

    # Ensure default workspace exists at startup
    @app.on_event("startup")
    def ensure_workspaces():
        from pathlib import Path

        (Path("workspaces") / "Default").mkdir(parents=True, exist_ok=True)

    # UI shell routes
    @app.get("/dashboard")
    def ui_dashboard(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "dashboard-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/imagine")
    def ui_imagine(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "dashboard-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/create")
    def ui_create(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "create-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/publish")
    def ui_publish(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "publish-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/library")
    def ui_library(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "library-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/system")
    def ui_system(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "system-view",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/settings")
    def ui_settings(request: Request):
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "active_view": "settings-profile",
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    @app.get("/settings/project")
    def project_settings(request: Request):
        return templates.TemplateResponse(
            request,
            "settings_project.html",
            {
                "request": request,
                "use_dark_studio_ui": app.state.settings.USE_DARK_STUDIO_UI,
            },
        )

    return app


app = create_app()

# Compatibility re-exports for tests
__all__ = [
    "app",
    "create_app",
    "start_queue_worker",
    "stop_queue_worker",
    "bootstrap_default_admin",
    "DEFAULT_ADMIN_EMAIL",
    "DEFAULT_ADMIN_PASSWORD",
    "TEST_USER_ACCOUNTS",
    "TEST_USER_PASSWORD",
    "project_path",
    "_youtube_upload_from_disk",
    "_user_payload",
    "_should_seed_defaults",
]


def _should_seed_defaults(env: str, allow_seeding: bool) -> bool:
    """Compatibility helper for tests: decide if default seeding should run."""
    return env == "dev" or bool(allow_seeding)
