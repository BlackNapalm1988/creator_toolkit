# Release Schedule

## Project: Creator Toolkit
## Current Track: 0.1.x → 0.2.0

---

## 1. Release Categories
- **alpha**: feature present, API may change, UI rough, warnings allowed
- **beta**: feature locked, API stable, UI ≥ 80% there, no breaking changes without note
- **stable**: ready for wider use, CI must be green, docs present

---

## 2. Standard Release Steps

1. **Plan**
   - Link GitHub Issues to the milestone (e.g. `v0.1.3`)
   - Prioritize: `bug > backend > ui/ux > docs`
   - Assign responsible agent (`@codex-backend`, `@codex-ui`, `@codex-release`)

2. **Implement**
   - Create short-lived branch:  
     - `fix/...` for bugs  
     - `feature/...` for new flows  
     - `chore/...` for CI / Ruff / Black
   - Run locally:
     ```bash
     ruff check .
     black --check .
     pytest
     ```

3. **Review**
   - Open PR with:
     - Summary
     - Linked Issues (`Fixes #123`)
     - Validation checklist
   - CI must pass: lint + tests

4. **Integrate**
   - Merge into `main`
   - Delete branch
   - Update milestone progress

5. **Release**
   - Tag:
     ```bash
     git tag -a vX.Y.Z -m "Release vX.Y.Z"
     git push origin vX.Y.Z
     ```
   - Attach `RELEASE_NOTES_vX.Y.Z.md` to GitHub Release

---

## 3. CI / Quality Gates
- **Required before merge:**
  - ✅ `ruff check .`
  - ✅ `black --check .`
  - ✅ `pytest`
- **Allowed in alpha:** warnings (document in release notes)
- **Not allowed in beta/stable:** unhandled warnings from core deps (pydantic, jose, etc.)

---

## 4. Milestone Structure
- `v0.1.3` → polish / UI / UX / warnings
- `v0.1.4` → integrations / automation / agents
- `v0.2.0` → feature-level upgrade (Imagine → Create → Publish fully wired)

---

## 5. Agent Responsibilities
- **@codex-backend**: API changes, YouTube routes, auth, storage
- **@codex-ui**: sidebar, publish panel, layout, padding, labels
- **@codex-lint**: open `chore/lint-fixes` PRs when code drifts
- **@codex-release**: create tags, generate release notes from template
