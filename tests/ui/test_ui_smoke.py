import os
import socket
import threading
import time
from contextlib import closing

import pytest
import requests
import uvicorn


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def server_base_url():
    os.environ["ENV"] = "dev"
    os.environ["ALLOW_SEEDING"] = "1"

    # Clear cached settings so ENV is respected
    try:
        from app.core.settings import get_settings  # noqa: WPS433

        get_settings.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass

    # Lazy import after env set and cache clear
    from app.main import app as asgi_app  # noqa: WPS433

    port = _free_port()
    config = uvicorn.Config(asgi_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base = f"http://127.0.0.1:{port}"
    # wait for server
    for _ in range(50):
        try:
            requests.get(base + "/dashboard", timeout=0.25)
            break
        except Exception:
            time.sleep(0.1)
    yield base
    # uvicorn stops on process exit (daemon thread)


@pytest.fixture(scope="session")
def playwright():
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        pytest.skip("playwright not installed", allow_module_level=True)
    from playwright.sync_api import sync_playwright  # type: ignore

    with sync_playwright() as p:
        yield p


@pytest.mark.playwright
def test_footer_and_nav_inspector(playwright, server_base_url):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto(server_base_url + "/dashboard")

    # Footer present
    assert page.locator("footer.footerbar").is_visible()
    assert (
        page.locator("footer.footerbar .brand").inner_text().strip()
        == "Creator Toolkit"
    )

    # Sidebar collapse/expand toggles class on #app
    page.click("#collapseSidebar")
    assert page.locator("#app.ct-shell--sidebar-collapsed").count() == 1
    page.click("#toggleSidebar")
    assert page.locator("#app.ct-shell--sidebar-collapsed").count() == 0

    # Inspector open/close
    page.click("#openInspector")
    assert page.locator("#app:not(.ct-inspector--closed)").count() == 1
    page.click("#toggleInspector")
    assert page.locator("#app.ct-inspector--closed").count() == 1

    browser.close()


@pytest.mark.playwright
def test_login_flow_updates_ui(playwright, server_base_url):
    # Default admin credentials are seeded in dev
    from app.services.seeding import DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD

    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto(server_base_url + "/dashboard")

    # Open login modal and login
    page.click("#openLoginButton")
    page.fill("#loginEmail", DEFAULT_ADMIN_EMAIL)
    page.fill("#loginPassword", DEFAULT_ADMIN_PASSWORD)
    page.click("#loginSubmit")

    # Header switches to user actions
    page.wait_for_selector("#userActions:not(.hidden)")
    assert page.locator("#userGreeting").is_visible()

    # Admin should see Docs link
    assert page.locator("#docsLink").is_visible()

    # Logout and verify reset
    page.click("#logoutButton")
    page.wait_for_selector("#authActions:not(.hidden)")

    browser.close()
