# Pre-release: Creator Toolkit v0.1.0-alpha.1

## Overview

Creator Toolkit is an early-stage content operations stack for AI-driven media production.  
It centralizes prompt iteration, batch QA, packaging, asset management, and publishing (YouTube) behind one API and dashboard.

This is an **alpha build**. Expect breaking changes, missing guardrails, and sharp edges. Do not expose this to untrusted users yet.

---

## Current Capabilities (Implemented)

### 1. Auth / User Management

- Email + password registration and login
- Email verification flow
- JWT-based session model
- Encrypted storage of provider API keys (OpenAI, ElevenLabs, YouTube, etc.)
- Access group / role field on the user profile for future permission control

### 2. “Imagine” / Prompt Workspace

- Create and manage creative threads for ideation and style direction
- Append new messages/prompts to a thread
- Retrieve thread history for continuity
- List supported model options
- This is the start of a reusable "creative brain" for a project or series

### 3. QA and Packaging Pipeline

- `/qa` and `/qa/batch`: run quality/consistency checks on single or multiple inputs
- `/qa/batch_csv`: upload CSV and run QA across each row (bulk script review / content audit)
- `/package` and `/package/master`: create exportable content bundles for downstream publishing
- Async variants (`/qa/batch_async`, `/package_async`) offload heavy work to a background job queue

### 4. Background Worker / Job Queue

- Jobs are stored in `jobs.db`
- A separate worker process (`scripts/worker.py`) polls for queued jobs, executes them, and writes back status/results
- Long-running or rate-limited work (batch QA, packaging, etc.) does not block the main API
- This is the foundation for scalable “generate 20 clips and prep them for upload” style workflows

### 5. YouTube Integration

- OAuth flow and channel lookup
- Upload endpoint for pushing packaged output to YouTube
- This is the first publishing backend (TikTok / Reels style publishing is planned to build on this)

### 6. Projects / Presets

- Ability to store and retrieve project definitions and presets
- Used to keep creative style, tone, or series assets consistent across multiple generations

### 7. Dashboard (Early UI)

- Basic dashboard page (`/dashboard`) and static assets
- This is the initial surface for turning the API into something an actual content lead can drive without touching the terminal

---

## Coming Next (Planned / In Progress)

### 1. Dashboard Data Binding

- New route: `GET /dashboard/data`
- `/dashboard` will display live data for the signed-in user:
  - Profile info (name, access group, email verified)
  - Connected provider status (OpenAI, ElevenLabs, YouTube)
  - Recent jobs (status, progress, last updated)
  - Recent packaged assets
- Goal: You can log in and immediately see “what’s happening in the studio” without looking at logs or the DB.

### 2. Roles / Access Control / Quotas

- Lock down “dangerous” actions like uploading to YouTube or spending money on an API
- Add basic per-user rate limiting / quotas for generation endpoints
- Prepare for onboarding collaborators without giving them full keys

### 3. Job Progress & Error Surfacing

- Worker will start writing `progress` and `stage` back to each job row
- `/jobs/{id}` will return `status`, `progress`, and failure reasons
- Dashboard will show a proper progress bar and human-readable error messages

### 4. Project-aware Views

- Tie jobs and assets to a specific project/series
- Filter dashboard by project to get a “production view” for each show / campaign / series
- Foundation for per-project analytics and cost tracking

### 5. Multi-Platform Publishing

- Abstract publisher logic so YouTube upload is just the first target
- Add placeholders for TikTok / Reels-style publishing under a unified `/publish` flow

---

## Known Limitations / Warnings

- Security hardening is not complete:
  - No full RBAC (role-based access control) enforcement yet
  - Some endpoints assume trusted usage and may allow expensive actions or publishing
- Rate limiting is not in place
- Dashboard is not yet fully wired to live backend data (this is what’s coming in the next cut)
- Error handling for long-running jobs is still pretty raw; failures may not surface cleanly in the UI
- Asset tracking is still basic — packaged outputs are not yet first-class objects with metadata, previews, etc.

---

## Intended Audience for This Pre-release

- Contributors who want to help shape the architecture
- Early testers running this locally for their own creative pipeline
- People evaluating whether to build tooling on top of this (e.g. “Can I run my shorts pipeline through this?”)

This is **NOT** production-ready for:

- Handing to paying customers
- Exposing to untrusted end-users
- Unattended scheduled publishing

---

## Versioning / Stability Notes

**Tag:** `v0.1.0-alpha.1`

- Currently using `0.x.y` semver (pre-1.0 unstable API).
- Breaking API changes may occur without bumping MAJOR.
- New features bump MINOR (e.g. `0.2.0-alpha.0` for live dashboard data binding).
- Bug fixes bump PATCH (e.g. `0.1.1-alpha.1`).

When the external API (endpoints, response shapes) is considered stable, we’ll start moving toward `1.0.0`.

---

## How to Run Locally (Developer Mode)

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1 on Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create a .env file with your keys (do NOT commit it)
# Example variables:
OPENAI_API_KEY="sk-..."
ELEVENLABS_API_KEY="..."
YOUTUBE_CLIENT_ID="..."
YOUTUBE_CLIENT_SECRET="..."

# 4. Start the app
uvicorn main:app --reload --port 8000

# 5. Run the background worker
python scripts/worker.py
```

Visit:

- API Docs → [http://localhost:8000/docs](http://localhost:8000/docs)
- Dashboard → [http://localhost:8000/dashboard](http://localhost:8000/dashboard)

---

## Final Notes

This release marks a major milestone in the Creator Toolkit journey:

- The core shape of the platform exists.
- The worker pipeline exists.
- The product is evolving from a prototype into a structured platform.
- The next phase will focus on **visibility**, **safety**, and **repeatability**.

> You’re looking at the foundation of an AI production studio in a box.
