import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from app.api.admin import router as admin_router
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
from modules.storage import project_path

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Creator Toolkit",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

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
    settings = get_settings()
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

    # settings already attached above

    # Doc endpoints guarded by dev_user
    @app.get("/openapi.json", include_in_schema=False)
    def custom_openapi(user=Depends(dev_user)):
        return JSONResponse(app.openapi())

    @app.get("/docs", include_in_schema=False)
    def custom_docs(user=Depends(dev_user)):
        return get_swagger_ui_html(
            openapi_url="/openapi.json", title="Creator Toolkit API Docs"
        )

    # UI shell routes
    @app.get("/dashboard")
    def ui_dashboard(request: Request):
        return templates.TemplateResponse(
            "dashboard.html", {"request": request, "active_view": "dashboard-view"}
        )

    @app.get("/imagine")
    def ui_imagine(request: Request):
        return templates.TemplateResponse(
            "dashboard.html", {"request": request, "active_view": "imagine-view"}
        )

    @app.get("/create")
    def ui_create(request: Request):
        return templates.TemplateResponse(
            "dashboard.html", {"request": request, "active_view": "create-view"}
        )

    @app.get("/publish")
    def ui_publish(request: Request):
        return templates.TemplateResponse(
            "dashboard.html", {"request": request, "active_view": "publish-view"}
        )

    @app.get("/system")
    def ui_system(request: Request):
        return templates.TemplateResponse(
            "dashboard.html", {"request": request, "active_view": "system-view"}
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
