# Creator Toolkit

Creator Toolkit is a FastAPI application that stitches together creative tooling for short-form video teams. It mixes guided prompt ideation, asset management, packaging utilities, and YouTube publishing helpers into a single dashboard and API.

## Features

- **Authentication & profile management** – email/password login with JWT cookies, email verification, and encrypted storage for per-user API keys.
- **Imagine chat workspace** – OpenAI-powered chat threads that help brainstorm visual and audio ideas while saving message history per user.
- **Asset storage helpers** – lightweight JSON/SQLite persistence for projects, presets, and generated media paths.
- **Background job queue** – SQLite-backed queue with a worker thread for long-running tasks like video packaging or QA batch analysis.
- **Packaging pipeline** – utilities to loop/mux video + audio assets, including ElevenLabs text-to-speech integration for narration.
- **YouTube publishing** – OAuth helper endpoints to refresh upload tokens, normalize scheduling data, and upload finished videos directly.
- **Dashboard UI shell** – Jinja2 template and static assets that surface the Imagine, Create, and Publish workflows in the browser.

#### Dashboard Data Binding
- `GET /dashboard/data` — Returns combined JSON for the current user's profile, connected service status, recent jobs, and recent assets.
- The `/dashboard` page now dynamically fetches and displays this data for a live overview.
- Users can monitor job progress and service connections in real time.

## Installation

1. **Clone & set up Python**
   ```bash
   git clone <repo-url>
   cd creator_toolkit
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```
2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure environment**
   Copy `.env.example` (if present) or create a `.env` file with at least the following keys:
   ```env
   JWT_SECRET=change_me
   FERNET_SECRET=<32-byte urlsafe base64 key>
   SMTP_HOST=smtp.example.com
   SMTP_USER=mailer@example.com
   SMTP_PASSWORD=...
   SMTP_PORT=587
   SMTP_USE_TLS=1
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
   You will also need provider API keys saved through the profile endpoints (OpenAI, ElevenLabs, YouTube refresh tokens).

## Running the app

```bash
uvicorn main:app --reload
```

The FastAPI app automatically starts a background `QueueWorker` so common jobs run without launching a separate process. For dedicated job execution you can also run:

```bash
python scripts/worker.py
```

Visit `http://localhost:8000/dashboard` to use the dashboard shell. Authenticated developer accounts can open the API docs at `/docs` once verified.
The `templates/dashboard.html` view now loads its profile, provider, job, and asset cards by fetching `/dashboard/data` on page load.

## Testing

We use pytest-style tests stored in the `tests/` directory. The suite boots a FastAPI `TestClient` and uses temporary SQLite databases so it can run without touching your local `data/` files.

To execute the tests locally:

```bash
pytest
```

Before running the tests, install the dependencies from `requirements.txt` and set any required environment variables (for example `JWT_SECRET`) so the application can start. When adding new features, include accompanying tests that cover happy paths, authentication/authorization behaviour, and basic error handling.

## Key API Routes

- `GET /dashboard/data` – Aggregated dashboard payload for the signed-in user.
- `GET /dashboard` – Renders the interactive dashboard shell.
- `POST /auth/register` – Create a user account.
- `POST /auth/login` – Authenticate and receive a JWT.
- `POST /profile/keys` – Store or update encrypted provider API keys.
- `POST /qa/batch_async` – Queue a QA batch job for processing.

## Typical workflow

1. **Sign up & verify** – create an account via the auth endpoints, then use the verification email to unlock developer features.
2. **Store API keys** – POST to `/profile/keys` to encrypt and save provider secrets.
3. **Ideate in Imagine** – create chat threads with `/imagine/thread` and `/imagine/send` to iterate on prompts.
4. **Generate assets** – call `/imagine/send`, `/elevenlabs/voices`, `/elevenlabs/generate`, and packaging endpoints to produce video/audio.
5. **Publish** – use `/youtube/upload` (and related helpers) to push finalized videos to your channel.

## Project layout

```
creator_toolkit/
├── main.py              # FastAPI application wiring all routes and background jobs
├── modules/             # Reusable service layers (auth, chat history, jobs, storage, users, packager)
├── templates/           # Dashboard HTML shell
├── static/              # CSS, uploaded assets, generated media
├── data/                # SQLite DBs and JSON stores created at runtime
├── scripts/             # Standalone helpers (e.g., dedicated job worker)
├── scenes/, ui/         # Front-end or pipeline resources (placeholders for future work)
└── requirements.txt     # Python dependencies
```

## Contributing

Pull requests are welcome! Please:

- Follow the existing code style (Black-compatible, type-annotated helpers, descriptive docstrings).
- Update or add tests/scripts when altering core logic.
- Include clear descriptions of the feature or bug fix.

## License

No license has been specified. Assume all rights reserved unless the repository owner states otherwise.
