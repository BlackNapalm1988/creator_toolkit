# Changelog

## v1.2-core-restoration — 2025-10-30

- Started the background queue worker from FastAPI's `startup` event and added a shutdown hook that stops and joins the thread.
- Simplified JWT handling to rely on `python-jose`, removed the PyJWT fallback dependency, and surfaced an error log when the default secret is used.
- Added the `modules.storage.project_path` helper and refactored packaging job handlers to create timestamped outputs, wrap failures in `set_error`, and persist `result.out_path`.
- Extended job serializers and endpoints to expose `out_path`, `logs`, and detailed `result` objects; updated tests to assert the new contract.
- Restored role-aware navigation using `data-roles`, locked tabs for unverified users with a verification banner, and removed the legacy `/ui` static shell.
- Hardened the pytest suite with isolated databases, runtime directory cleanup, worker shutdown safety, and a dedicated worker startup test.
- Updated CI to run `pytest -q` with the background worker disabled and to verify that required sections remain in `Agents.md`.
- Refreshed README and Agents documentation to describe the new worker lifecycle, navigation rules, packaging outputs, and testing expectations.
- Switched the default admin account to `admin@local.test`, migrated legacy installs automatically, and documented the change for login flows.
