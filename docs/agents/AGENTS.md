# Agents / Services Overview

DO NOT AUTOGENERATE
This document defines contributor/agent contracts. Changes to this file must be intentional and human-reviewed.

This document explains the main logical agents/services in the Creator Toolkit, how they interact, and what quality/testing standards each one is required to meet.

---

## 1. API Server (FastAPI App)

**File:** `main.py`  
**Related modules:** `modules/*.py` (auth, chat, jobs, packager, etc.)

**Role:**  
The API Server is the main orchestrator. It exposes HTTP routes for:

- Creative generation (`/imagine/*`)
- QA and packaging (`/qa`, `/package`, etc.)
- Media generation (`/generate/music`, `/generate/video`)
- YouTube integration and publishing
- User auth / profile management
- Project and preset management
- Dashboard data aggregation (e.g. `/dashboard/data`)

**Key Responsibilities:**

- Receive user requests and enforce auth/permissions.
- Store and fetch data from `data/` (auth.db, chat.db, jobs.db, projects.json).
- For long-running/rate-limited work, enqueue a job in `jobs.db` instead of blocking the request.
- Act as the “front-of-house” for all other agents.

**Quality / Testing (API Server):**

- Every new route MUST have tests.
  - **Success path test:** authenticated call (or allowed anonymous call, if public).
  - **Rejection path test:** unauthenticated/unauthorized access should fail in the expected way.
- Public response shapes are considered part of the contract. If you change them, update tests and document the breaking change in the PR summary.
- README.md must be updated when new public routes are added (for example, `/dashboard/data`).
- Any new testing utility packages added for this must be added to `requirements.txt` (e.g. pytest, httpx, etc.).

---

## 2. Worker Agent (Background Worker)

**File:** `scripts/worker.py`  
**Helpers:**

- `modules/jobs.py`
- `modules/job_handlers.py`
- `modules/packager.py`
- `data/jobs.db`

**Role:**  
This agent is the “heavy lifter.” It continuously polls the queue in `jobs.db`, finds jobs with status `queued`, runs them, and writes back results.

Typical job types include (examples):

- `qa_batch_async`: bulk QA over many prompts/script rows
- `package_async`: bundle scenes, audio, video, metadata into deliverables

**Key Responsibilities:**

- Load the job payload from `jobs.db`.
- Mark the job as `running`, call the correct handler, capture output or error.
- Write progress, stage, and final status (`complete` / `failed`) back to the DB.
- Emit incremental `stage`, `progress`, `status`, and `updated_at` changes during long-running work, and capture a human-readable `error_message` when a job fails.
- Prevent the API Server from blocking on long work, or from hitting provider rate limits directly in-request.

**Quality / Testing (Worker Agent):**

- Add tests for each new job handler to confirm workflow:
  - Job is picked up and marked `running`.
  - Output or error is written.
  - Final status is updated (`complete` / `failed`).
- Progress reporting logic (if present) should be asserted in tests (e.g. `progress` moves 0→100 or stages update).
- Tests must assert that stage/progress/status fields update over time and that `error_message` is populated on failure paths.
- Result payloads must expose a timestamped `out_path` (and any other metadata the dashboard consumes). Tests should assert clients read the output path from the job record instead of assuming static filenames.
- Job handlers MUST NOT depend on live external services in tests. Use fakes/mocks/dummy payloads.
- If the worker’s schema or job payload format changes, update README.md (section on “Job Queue / Background Worker”) so contributors know what a job is supposed to look like.
- Use the `DISABLE_QUEUE_WORKER=1` flag when running pytest suites that should not spawn the worker thread.

---

## 3. Auth / Identity Agent

**Files:**

- `modules/auth.py`
- `modules/users.py`
- `data/auth.db`

**Role:**  
Owns identity and trust.

- Handles registration, login, and email verification.
- Issues and validates JWT tokens.
- Encrypts/decrypts user-provided provider keys (OpenAI, ElevenLabs, YouTube, etc.).
- Manages role-based access control and password rotation flags.

**Key Responsibilities:**

- Securely store hashed passwords and verification codes.
- Expose profile routes (e.g. `/me`, `/profile/keys`) that let a user manage identity and credentials.
- Gate access to routes that can spend money (generation) or publish content (YouTube upload).
- Never expose full provider keys or secrets in any response body.
- Maintain role assignments (admin / owner / editor / viewer) and expose admin tools such as `/profile/role` and `/admin/system/smtp`.
- Enforce password rotation via the `must_change_password` flag and surface that status in API responses.

**Quality / Testing (Auth / Identity Agent):**

- Add tests for:
  - Successful login / token issuance for a verified user.
  - Rejected login for invalid credentials.
  - Rejected or restricted access if a user is unverified / lacks role.
  - Role-based access enforcement (admin-only SMTP endpoints, publish permissions, viewer dashboard access).
  - Password rotation clearing after `/profile/password` updates.
  - Bootstrap admin user creation on empty databases.
- Add tests that protected endpoints actually require valid auth (e.g. `/dashboard/data` should not respond to anonymous requests).
- Use dummy keys and dummy emails in tests — do not leak real credentials.
- If auth flows change in a breaking way (for example, adding new role requirements), that must be reflected in tests AND described in the PR summary.

---

## 4. Chat / Imagine Agent

**Files:**

- `modules/chat.py`
- `data/chat.db`
- Imagine-related endpoints in `main.py` (`/imagine/thread`, `/imagine/send`, `/imagine/history/{thread_id}`, `/imagine/models`)

**Role:**  
This is the “creative brain.”

- Stores threaded creative sessions (“threads”) for ideation, style direction, lore, and continuity.
- Lets you append new prompts / messages and retrieve past context.
- Surfaces supported model options.

**Key Responsibilities:**

- Maintain clean thread history so output stays consistent across generations.
- Allow retrieval so the dashboard (or any client) can render past creative context.
- Act as a memory layer for style, voice, tone, and content rules.

**Quality / Testing (Chat / Imagine Agent):**

- Add tests for:
  - Creating a new thread.
  - Appending a message to an existing thread.
  - Retrieving the full history for a thread.
- Add tests for user scoping / isolation if applicable (user A cannot read user B’s thread).
- Include unauthorized access attempts in tests to confirm correct rejection.
- If the thread storage schema or response structure changes, update README.md (“Imagine / Prompt Workspace”) so usage is still accurate.

---

## 5. Storage / Packaging Agent

**Files:**

- `modules/storage.py`
- `modules/packager.py`
- `modules/job_handlers.py`
- `data/projects.json`
- `scenes/`
- (outputs are ultimately published to YouTube or exported as bundles)

**Role:**  
This agent is responsible for taking generated content and turning it into something usable and publishable.

- Maintains project definitions, presets, style guides.
- Tracks or assembles assets (audio, video, thumbnails, metadata).
- Produces “packages” that are ready for upload or export.

**Key Responsibilities:**

- Produce bundle artifacts from raw pieces.
- Associate assets with a project or series.
- Support downstream publishing (YouTube now, additional platforms later).
- Eventually surface recent assets so the dashboard can show “Here’s what you just made.”

**Quality / Testing (Storage / Packaging Agent):**

- Add tests for packaging functions to ensure they return the expected bundle structure (file paths, metadata).
- If packaging writes output metadata (asset type, timestamps, etc.), test that those records can be retrieved afterward.
- Add tests confirming that restricted assets can't be accessed by unauthorized users.
- If you add `/export/` or `/publish/` style routes, write tests that confirm correct behavior AND that unsafe calls are blocked without the right role.

---

## 6. Dashboard / Visibility Layer

**Files:**

- `templates/dashboard.html`
- `static/app.js` (or equivalent dashboard JS)
- `/dashboard` route(s) in `main.py`
- `/dashboard/data` endpoint

**Role:**  
Human control center.

- Surfaces authenticated user info (name, access group, verification).
- Shows provider connection state (OpenAI, ElevenLabs, YouTube).
- Lists recent jobs and their progress/status.
- Surfaces recently packaged/generated assets for review.
- Gives non-technical users situational awareness without looking at the DB or logs.

**Key Responsibilities:**

- Fetch `/dashboard/data` and render it dynamically in the browser.
- Display clear “connected / missing” states for provider integrations.
- Display job status and error state in a human-readable way.
- Render a persistent left-hand sidebar with Dashboard/Create/System navigation, hiding Create for viewers and System for non-admin roles.
- Surface live job progress using `/dashboard/data.active_jobs` (progress bars, failure banners) without exposing secrets.
- Never leak secrets (keys/tokens) to the DOM.

**Quality / Testing (Dashboard / Visibility Layer):**

- Add backend tests for `/dashboard/data`:
  - Authenticated request returns 200 with `user`, `providers`, `recent_jobs`, `recent_assets`, and `active_jobs`.
  - Unauthenticated request is rejected.
- Tests should assert that `/dashboard/data.user.role` and `.must_change_password` are present so the UI can enforce role-aware navigation.
- When logic changes (e.g. adding job `progress` or `stage`), update both the endpoint tests and the README “Dashboard Data Binding” section.
- Front-end behavior should degrade gracefully if `/dashboard/data` fetch fails (e.g. display an error message instead of leaving the page blank).

---

## High-Level Flow (How These Agents Work Together)

1. User signs in via the Auth / Identity Agent and gets an access token.
2. User opens `/dashboard`. The Dashboard Layer calls `/dashboard/data` on the API Server.
3. The API Server gathers:
   - user profile and provider status from Auth / Identity Agent
   - recent jobs (and their statuses/progress) from the Worker Agent + jobs.db
   - recent packaged assets from the Storage / Packaging Agent
4. Long-running work (batch QA, packaging a release bundle, etc.) is not executed inline — the API Server just enqueues a job.
5. The Worker Agent runs that job in the background and updates jobs.db.
6. The Dashboard Layer polls `/dashboard/data` (or `/jobs/{id}` in the future) to surface live status to the human.

This gives us a production studio loop: prompt → generate → evaluate → package → publish → review.

---

## Quality & Testing Expectations (Global / All Agents)

The following rules apply to EVERY agent above and ALL future pull requests.

1. **Tests Are Mandatory**
   - Every new feature (endpoint, handler, packaging step, etc.) must include tests in `tests/`.
   - Include at least:
     - Happy path / success case
     - Auth / permission failure case (unauthorized or forbidden)
   - Tests must pass locally (e.g. via `pytest`) before the work is considered complete.

2. **Auth & Safety Must Be Tested**
   - Any route that returns private data or triggers spend/publishing MUST include an unauthorized access test.
   - Work is not “done” if protected routes respond to anonymous callers.

3. **No Real Secrets in Tests**
   - Use dummy API keys, dummy project names, dummy asset paths.
   - Never commit live keys, refresh tokens, YouTube tokens, etc.

4. **README.md Must Stay in Sync**
   - If you add a new public route (like `/dashboard/data`) or change how a route behaves, update README.md accordingly.
   - README.md must include how to run tests.
   - If you add a new flow (“Dashboard Data Binding”), the README must describe it at a high level so a new contributor can get oriented quickly.

5. **requirements.txt Must Stay in Sync**
   - If you add new dev/test dependencies (pytest, httpx, pytest-asyncio, etc.), update `requirements.txt`.
   - The PR summary must mention those new dependencies.

6. **PR Summary Requirements**  
   Each PR should clearly state:
   - Total tests run / total passed.
   - Confirmation that tests were executed locally after the changes.
   - List of any new dependencies added to `requirements.txt`.
   - Confirmation that README.md has been updated for any new routes or changed behavior.

7. **No Silent Contract Changes**
   - If you change the response shape of an endpoint (for example, adding `progress` to job objects in `/dashboard/data`), you MUST:
     - update the tests for that endpoint,
     - update README.md where that endpoint is documented,
     - mention the change in the PR summary as a contract change.

---

## TL;DR

- API Server = front-of-house (routes, auth, coordination)
- Worker Agent = heavy background execution and job status tracking
- Auth / Identity Agent = trust, roles, protected keys
- Chat / Imagine Agent = creative memory and prompt continuity
- Storage / Packaging Agent = bundle creation and asset output for publishing
- Dashboard Layer = human-facing control surface that shows live status

**Every agent now ships with tests, updates README.md when behavior changes, and calls out breaking changes in the PR.**  
This is the baseline going forward.

---

## 2025-10 Updates (worker, dashboard roles, packaging paths)

1. **Worker startup moved to app startup**
   - The background Queue Worker is now started from the FastAPI app’s `startup` event.
   - Any agent, test, or script that enqueues jobs MUST ensure the app has started (e.g. run uvicorn) before asserting job status/progress.
   - Direct `import main` is no longer guaranteed to start the worker.

2. **Dashboard role visibility is enforced**
   - Sidebar items (`Imagine`, `Create`, `Publish`, `System`) now use the template’s `data-roles` attribute. Buttons remain visible for allowed roles, and unverified users see a banner plus “locked” navigation rather than losing the tab.
   - UI tests MUST authenticate as `admin` or `owner` before asserting the presence of all sidebar items.
   - Viewer-level users should only see viewer tabs; do not override these guards.

3. **Packaging/job handlers must return output path**
   - Handlers may now emit unique output filenames (e.g. timestamped) to avoid overwriting previous runs.
   - Clients and tests MUST read the output path from the job object (DB / API response) instead of assuming `static/uploads/master.mp4`.
   - When the output schema changes, update tests and README as per the global rules above.
