# Agents / Services Overview

This document explains the main logical agents/services in the Creator Toolkit and how they interact.

---

## 1. API Server (FastAPI App)

**File:** `main.py`

**Role:**  
The API Server is the main orchestrator. It exposes HTTP routes for:
- creative generation (`/imagine/*`)
- QA and packaging (`/qa`, `/package`, etc.)
- media generation (`/generate/music`, `/generate/video`)
- YouTube integration
- user auth and profile
- project/preset storage

**Key Responsibilities:**
- Receive user requests
- Validate auth / permissions
- Store and fetch data in `data/*.db` and `projects.json`
- For long tasks: create a job record in `jobs.db` instead of doing heavy work inline

**Outputs:**
- Immediate responses for fast tasks
- Job IDs for slow tasks (to be processed by the Worker Agent)

---

## 2. Worker Agent (Background Worker)

**File:** `scripts/worker.py`  
**Helpers:** `modules/jobs.py`, `modules/job_handlers.py`, `modules/packager.py`

**Role:**  
Continuously polls the `jobs.db` queue, finds work with status `queued`, runs it, and writes back the result.

**Typical Job Types:**
- `package_async`: bundle up generated content, scenes, prompts, etc. into a distributable output
- `qa_batch_async`: run QA across many prompts / scenes / CSV rows

**Key Responsibilities:**
- Load job payload from `jobs.db`
- Dispatch to the correct handler in `modules/job_handlers.py`
- Update job status to `running`, then `complete` or `failed`
- Store result data or error message for retrieval via `/jobs/{jid}`

**Why separate process?**
- Keeps the main API responsive
- Lets you run long / rate-limited / streaming model calls without blocking requests
- Easier to scale: you can run multiple workers later

---

## 3. Auth / Identity Agent

**Files:**  
- `modules/auth.py`  
- `modules/users.py`  
- `data/auth.db`

**Role:**  
Manages users, login, and secrets.

**Key Responsibilities:**
- Hash and verify passwords
- Issue and validate JWT access tokens
- Store "verification codes" for email confirmation
- Encrypt/decrypt provider API keys per user (OpenAI, ElevenLabs, YouTube, etc.)
- Track access group / role

**Surface APIs (examples):**
- `/auth/register`
- `/auth/login`
- `/auth/verify-email`
- `/profile/keys`

This agent is essentially the gatekeeper for who can call the generation endpoints and with what credentials.

---

## 4. Chat / Imagine Agent

**Files:**  
- `modules/chat.py`  
- `data/chat.db`  
- Imagine endpoints in `main.py` (`/imagine/*`)

**Role:**  
Stores threaded creative conversations and prompt iterations.

**Key Responsibilities:**
- Create a new "thread" (context block)
- Append user messages / system messages
- Retrieve history so generation can stay consistent in style and lore
- Surface available model options

This is where your creative direction lives across iterations.

---

## 5. Storage / Packaging Agent

**Files:**  
- `modules/storage.py`  
- `modules/packager.py`  
- `modules/job_handlers.py`  
- `data/projects.json`
- `scenes/`

**Role:**  
Organizes outputs and bundles them for export or publishing.

**Key Responsibilities:**
- Track projects, presets, scene YAML
- Build final "packages" of content for delivery (text, prompts, assets)
- Save and retrieve uploaded assets (`/upload`, `/download`)

This is what eventually feeds your YouTube upload flow or other distribution.

---

## High-Level Flow

1. User hits `/qa/batch_async` with a CSV.
2. API Server:
   - validates request
   - writes a new job row in `jobs.db` with status = `queued`
   - returns `{ job_id: ... }` to the client
3. Worker Agent:
   - wakes up, loads that job
   - runs `qa_batch` logic from `modules/job_handlers.py`
   - writes `status=complete` and attaches results
4. Client polls `/jobs/{job_id}` to read final output.

---

## Extending the System

To add a new capability:
1. Add a new endpoint in `main.py` that:
   - parses input
   - either runs fast logic OR inserts a new job

2. Add a new handler in `modules/job_handlers.py` if it's long-running.

3. Update the Worker Agent to route that new job type.

4. (Optional) Add a new table/DB/file under `data/` if persistence is needed.

This keeps the system modular and "agent-like":  
- API Server = front-of-house  
- Worker Agent = heavy lifting  
- Auth Agent = gatekeeper  
- Chat Agent = memory/continuity  
- Packaging Agent = output/publishing
