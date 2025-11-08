# 🧭 Creator Toolkit: Branching & Milestone Convention Guide

### 🧩 Purpose

Provide a shared structure for **Codex** and all automation agents so every PR, branch, and release remains consistent across backend, UI, and deployment workflows.

---

## 🪵 1. Branch Naming Convention

Each branch name should describe its purpose and scope clearly:

| Type                | Pattern                       | Example                       |
| ------------------- | ----------------------------- | ----------------------------- |
| Feature             | `feature/<short-description>` | `feature/youtube-json-upload` |
| Fix / Bug           | `fix/<short-description>`     | `fix/ui-publish-button`       |
| Chore / Maintenance | `chore/<description>`         | `chore/update-dependencies`   |
| Documentation       | `docs/<description>`          | `docs/add-agent-guidelines`   |
| Release Prep        | `release/v<version>`          | `release/v0.1.3`              |

> **Rules**
>
> - Use lowercase and hyphens only.
> - Keep under 40 chars if possible.
> - Branch names must be short-lived (merge/delete within 3 days).

---

## 🧱 2. Pull Request Format

Every agent (or human) should open PRs with this structure:

**Title**

```
[feature|fix|chore|docs]: short, imperative description
```

**Description**

```
### Summary
Brief explanation of what this branch accomplishes.

### Linked Issues
Fixes #23, Fixes #25  ← auto-closes issues when merged

### Validation
- [ ] Tests pass locally (`pytest`)
- [ ] Ruff & Black checks pass
- [ ] Frontend verified (if applicable)
- [ ] No console or API errors

### Agent Tag
🧠 Responsible Agent: @<agent_name> (e.g., @codex-backend, @ui-agent)
```

---

## 🗓️ 3. Milestones and Releases

- Each release milestone corresponds to a semantic version (e.g. `v0.1.2`, `v0.1.3`).
- Use milestones in **GitHub Issues** to group all work planned for that release.
- When ready:
  1. Merge all feature/fix branches into `main`
  2. Tag the release:
     ```bash
     git tag -a v0.1.3 -m "Release v0.1.3"
     git push origin v0.1.3
     ```
  3. Draft a GitHub release linked to the milestone summary.

---

## 🧮 4. Testing & Linting Consistency

All branches (human or agent) **must** pass before merge:

```bash
ruff check .
black --check .
pytest
```

Agents responsible for formatting or backend changes should run:

- **Ruff** for lint
- **Black** for code format
- **Pytest** for validation

---

## ⚙️ 5. Automation Rules for Agents

| Agent            | Primary Role                | Workflow                                                   |
| ---------------- | --------------------------- | ---------------------------------------------------------- |
| `@codex-backend` | Backend features & tests    | Create `feature/...` or `fix/...` → Run tests + Ruff/Black |
| `@codex-ui`      | Frontend or UX              | Group UI issues into one branch per milestone              |
| `@codex-lint`    | Continuous lint enforcement | Auto-fix with Ruff/Black → open `chore/lint-fixes` PR      |
| `@codex-release` | Prepare release & tag       | Create `release/vX.Y.Z` → merge and tag                    |
| `@codex-docs`    | Docs / metadata             | Maintain `/docs/` consistency and changelogs               |

---

## 🧭 6. Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add YouTube JSON upload route
fix: correct file handling in publish endpoint
chore: update workflow lint names
docs: clarify branch naming in Agents guide
```

---

## 📦 7. Folder for Agents Docs

All coordination and conventions should live under:

```
/docs/agents/
    ├── Agents.md
    ├── BranchingGuide.md   ← (this file)
    ├── ReleaseChecklist.md
```
