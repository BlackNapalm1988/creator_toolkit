# 🧩 Creator Toolkit — Release Notes

### Version: `v0.1.2-alpha.1`

### Date: _(to be filled on release)_

---

## 🚀 Summary

This **alpha release** restores and stabilizes core functionality, enhances CI automation, enforces code consistency through Ruff and Black, and transitions the YouTube publishing workflow to a JSON-based API for full frontend compatibility.  
It establishes a clean foundation for upcoming feature work and UI/UX refinements in `v0.1.3`.

---

## 🧠 Highlights

### ✅ **Backend Updates**

- Reimplemented and stabilized **dashboard**, **sidebar**, and **core navigation** functionality.
- Restored missing **IMAGINE** and **PUBLISH** buttons.
- Introduced a new **JSON-based YouTube upload endpoint**, replacing the previous multipart version:
  - Accepts requests directly from the frontend via `postJSON("/youtube/upload", body)`.
  - Validates `video_path` and `title` fields before upload.
  - Returns clear `400` and `404` error codes for invalid inputs.
  - Maintains compatibility with existing `_youtube_get_access_token()` and `_youtube_upload_video()` helpers.
- Improved FastAPI exception handling and error clarity.

---

### ⚙️ **DevOps / CI Enhancements**

- Added **branch protection** to the `main` branch requiring all CI checks to pass before merging.
- Integrated **Ruff** and **Black** into the CI workflow for linting and formatting enforcement:
  - `ruff check .` for lint validation.
  - `black --check .` for consistent code style.
- Added optional `lint.yml` workflow for automated formatting checks.
- Enforced mandatory lint + pytest validation before merges.
- CI verified against Python **3.13.4** environment.

---

### 🧰 **Testing & Stability**

- **21 total tests passed** with **0 failures** (warnings temporarily left in place).
- Improved import order and removed lint issues (`E402`, `E722`, etc.) across modules.
- Consolidated test warnings and validated consistent behavior across all core modules.
- Verified proper initialization and environment loading order in `main.py`.

---

### 🪄 **Frontend / UI**

- Restored full sidebar functionality and navigation links.
- Confirmed accessibility of **Create** and **System** tabs.
- Verified integration between frontend and backend routes for publish workflow.
- Transitioned to **JSON-based** request handling for YouTube uploads for improved reliability and alignment with FastAPI expectations.

---

### 🧱 **Project Structure & Documentation**

- Added **Branching & Milestone Convention Guide** to `/docs/agents/`.
- Updated **Agents.md** for consistent behavior across Codex automation agents.
- Added **Codex prompt templates** for backend and automation tasks.
- Unified formatting, structure, and standards for future agent and collaborator consistency.

---

### 🧩 **Known Issues**

- Some minor **UI/UX refinements** (spacing, padding, and label alignment) are deferred to `v0.1.3`.
- **Pydantic warnings** (`protected_namespaces`) remain non-breaking and are planned for resolution in the next release.
- Future iteration will enhance YouTube upload progress indicators.

---

### 🧭 **Next Steps — Planned for v0.1.3**

- Add visual feedback for YouTube upload progress and success states.
- Expand test coverage for new endpoints and background tasks.
- Implement issue-to-branch automation for Codex workflows.
- Complete UI/UX refinements targeted at usability and design polish.

---

### 📦 **Changelog Summary**

| Type       | Description                                      |
| ---------- | ------------------------------------------------ |
| ✨ Feature | Added JSON-based YouTube publishing route        |
| 🔧 Fix     | Restored missing IMAGINE / PUBLISH UI buttons    |
| 🧹 Chore   | Integrated Ruff + Black linting enforcement      |
| 🧪 Tests   | 21 total tests passing, 0 failures               |
| 🧱 Docs    | Added BranchingGuide and Codex prompt templates  |
| 🚀 CI      | Added branch protection and CI gating for merges |
