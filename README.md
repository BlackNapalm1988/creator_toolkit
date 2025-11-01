# Creator Toolkit

Creator Toolkit is a FastAPI application that stitches together creative tooling for short-form video teams. It combines guided prompt ideation, asset management, packaging utilities, and YouTube publishing helpers into a single dashboard and API.

## Features

- **Authentication & profile management** — email/password login with JWT cookies, email verification, and encrypted storage for per-user API keys.
- **Imagine chat workspace** — OpenAI-powered chat threads that help brainstorm visual and audio ideas while saving message history per user.
- **Asset storage helpers** — lightweight JSON/SQLite persistence for projects, presets, and generated media paths.
- **Background job queue** — SQLite-backed queue whose worker starts during the FastAPI startup event, streams stage/progress updates, and records unique output paths for every run.
- **Packaging pipeline** — utilities to loop/mux video and audio assets, including optional ElevenLabs text-to-speech for narration.
- **YouTube publishing** — OAuth helper endpoints to refresh upload tokens, normalize scheduling data, and upload finished videos directly.
- **Dashboard UI shell** — Jinja2 template and static assets that surface the Dashboard, Imagine, Create, Publish, and System workspaces in the browser.

## Roles & Access

The toolkit includes role-based access control (RBAC) with four tiers:

| Role   | Capabilities |
|--------|--------------|
| **admin** | Full platform control: manage SMTP/system settings, publish content, update user roles, and maintain all provider keys. |
| **owner** | Produce and publish content for their environment and manage their own provider keys. |
| **editor** | Generate, QA, and package content but cannot publish or manage API keys. |
| **viewer** | Read-only access to dashboard data and generated assets. |

New users are provisioned as **owners** by default. API endpoints and the dashboard automatically adapt their behaviour based on the active role.

### Dashboard Data Binding

- `GET /dashboard/data` — Returns combined JSON for the current user's profile, provider status, active jobs, and recent assets.
- The `/dashboard` page fetches this payload to drive the sidebar, verification banner, and progress cards in real time.
- Job detail routes expose progress, logs, error messages, and output paths so operators can follow long-running work without digging into the database.

## Dashboard & Job Monitoring

- The left sidebar exposes **Dashboard**, **Imagine**, **Create**, **Publish**, and **System** workspaces. Buttons remain visible based on `data-roles`, and unverified users see a verification banner instead of losing navigation.
- Deep links (`/dashboard`, `/imagine`, `/create`, `/publish`, `/system`) load the same shell with the requested tab pre-selected.
- Panels surface your account details (role, verification state, password rotation), provider connection status, active job progress/errors, and recent assets.
- Read-only job endpoints power the UI:
  - `GET /jobs` — Recent jobs (admin/owner/editor only).
  - `GET /jobs/{job_id}` — Detailed view of a single job (admin/owner/editor only).
- Jobs return stage, progress, status, timestamps, logs, error messages, and output metadata. Example payload:

  ```json
  {
    "id": "abc123",
    "type": "package",
    "status": "complete",
    "stage": "complete",
    "progress": 100,
    "updated_at": "2025-10-30T00:15:00Z",
    "error_message": null,
    "out_path": "static/uploads/master_20251030001500987654.mp4",
    "created_at": "2025-10-30T00:14:55Z",
    "duration_ms": 184000,
    "logs": [
      "QA batch starting (3 asset(s))",
      "Processed 3/3",
      "QA batch complete"
    ],
    "result": {
      "out_path": "static/uploads/master_20251030001500987654.mp4",
      "audio_ms": 184000
    }
  }
  ```

## Installation

1. **Clone & set up Python**
   ```bash
   git clone <repo-url>
   cd creator_toolkit
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```
2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure environment**
   Copy `.env.example` or create a `.env` file with at least:
   ```env
   JWT_SECRET=change_me
   FERNET_SECRET=<32-byte urlsafe base64 key>
   JWT_ALG=HS256
   JWT_EXPIRE_MIN=43200
   SMTP_HOST=smtp.example.com
   SMTP_USER=mailer@example.com
   SMTP_PASSWORD=...
   SMTP_PORT=587
   SMTP_USE_TLS=1
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
   Provider API keys (OpenAI, ElevenLabs, YouTube refresh tokens, etc.) are stored via the `/profile/keys` endpoints and do not live in `.env`.

## Running the App

```bash
uvicorn main:app --reload
```

The queue worker now starts from FastAPI's `startup` event. Direct `import main` will not spawn background threads; run the app (or trigger the startup hook) before enqueueing jobs. For CI or isolated tests you can disable the worker with `DISABLE_QUEUE_WORKER=1`.

If `JWT_SECRET` is missing the server falls back to an insecure development default and logs an error. Always set a unique secret in shared or production environments.

You can still run a dedicated worker process if desired:

```bash
python scripts/worker.py
```

## First-Run Admin & Password Rotation

- On an empty user database the application bootstraps `admin@local.test` with the temporary password `CHANGE_ME_NOW` and flags `must_change_password` so the first login forces rotation.
- The login response and dashboard both surface the `must_change_password` flag until `/profile/password` completes successfully.
- Administrators manage SMTP credentials via `/admin/system/smtp`. Non-admins receive `403 Forbidden` responses.
- Startup logs warn if `JWT_SECRET` is left at the insecure default.

### Pre-seeded Test Users

For manual testing the app seeds one verified account per role on startup. Each account uses the shared password `password`:

| Role | Email |
|------|-------|
| admin | `user_admin@testing.com` |
| owner | `user_owner@testing.com` |
| editor | `user_editor@testing.com` |
| viewer | `user_viewer@testing.com` |

These users are intended for local development only; rotate or remove them before deploying to a shared environment.

## Testing

Pytest lives in the `tests/` directory. The suite uses temporary SQLite databases, disables the background worker via `DISABLE_QUEUE_WORKER=1`, and fakes packaging work so it can run without external services.

```bash
export DISABLE_QUEUE_WORKER=1  # optional: skips background thread
pytest -q
```

Always run the tests (and include new ones) when changing endpoints, job handlers, or dashboard contracts. Assertions cover RBAC enforcement, job lifecycle reporting (including `result.out_path` and `logs`), and password rotation behaviour.

## Key API Routes

- `GET /dashboard/data` — Aggregated dashboard payload for the signed-in user.
- `GET /dashboard` — Renders the interactive dashboard shell.
- `POST /auth/register` — Create a user account.
- `POST /auth/login` — Authenticate and receive a JWT plus rotation status.
- `POST /profile/keys` — Store or update encrypted provider API keys.
- `POST /profile/role` — Admin-only role management.
- `POST /qa/batch_async` — Queue a QA batch job.
- `GET /jobs` / `GET /jobs/{id}` — Inspect job history and live progress.
- `GET /admin/system/smtp` / `POST /admin/system/smtp` — Manage SMTP configuration (admin only).
- `POST /admin/system/smtp/test` — Send a test email using stored SMTP credentials (admin only).

## Typical Workflow

1. **Sign up & verify** — create an account via `/auth/register`, then redeem the verification email to unlock creator features.
2. **Store API keys** — call `/profile/keys` to encrypt provider secrets.
3. **Ideate in Imagine** — use `/imagine/thread` and `/imagine/send` to iterate on prompts.
4. **Generate assets** — trigger `/imagine/send`, `/elevenlabs/voices`, `/elevenlabs/generate`, and packaging jobs to produce media.
5. **Publish** — use `/youtube/upload` (and related helpers) to push finalized videos to your channel.

### YouTube Publishing

- `POST /youtube/upload` — Accepts `application/json` with fields like `video_path`, `title`, `description`, optional `tags` (array of strings), `privacy_status`, and `publish_at`. The backend reads the file directly from disk, so the `video_path` should point to a rendered video accessible to the server.
- `POST /youtube/upload-form` — Alternative multipart/form-data endpoint kept for manual testing in tools like Swagger or Postman.

## Project Layout

```
creator_toolkit/
├── main.py              # FastAPI application wiring all routes and background jobs
├── modules/             # Reusable service layers (auth, chat, jobs, storage, packager, etc.)
├── templates/           # Dashboard HTML shell
├── static/              # CSS, uploaded assets, generated media
├── data/                # SQLite DBs and JSON stores created at runtime
├── scripts/             # Standalone helpers (e.g. dedicated job worker)
├── scenes/              # Prompt/timeline assets
├── tests/               # Pytest suite covering endpoints, jobs, RBAC, and UI contracts
└── requirements.txt     # Python dependencies
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release highlights, including the v1.2 “Core Restoration” update that moved the worker to app startup, restored role-aware navigation, and ensured packaging jobs emit timestamped output paths.

## Contributing

Pull requests are welcome! Please:

- Follow the existing code style (Black-compatible, type annotations, descriptive docstrings).
- Update or add tests when altering core logic.
- Document contract changes in README/CHANGELOG and mention them in your PR summary.

## License

No license has been specified. Assume all rights reserved unless the repository owner states otherwise.
