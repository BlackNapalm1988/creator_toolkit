from pathlib import Path


def test_video_panel_has_new_controls():
    tpl = Path("templates/dashboard.html").read_text(encoding="utf-8")
    assert 'id="videoStyle"' in tpl
    assert 'id="videoMotion"' in tpl
    assert 'id="videoSeed"' in tpl
    assert 'name="videoType"' in tpl
    assert 'name="videoRemixMode"' in tpl


def test_video_panel_removed_debug_result():
    tpl = Path("templates/dashboard.html").read_text(encoding="utf-8")
    # The modern create-video panel should not show the inline result label
    assert '<pre id="videoResult"' not in tpl
