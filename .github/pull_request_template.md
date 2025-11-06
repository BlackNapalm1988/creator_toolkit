## Summary

Provide a concise description of the change and its rationale.

## Checklist

- [ ] Lint passes: `make lint` (ruff)
- [ ] Dead code scan reviewed: `make deadcode` (vulture; non-blocking but triaged)
- [ ] Dependency hygiene: `make deps` (deptry)
- [ ] Vulnerability audit reviewed: `make audit` (pip-audit; warn-only)
- [ ] Tests pass locally: `make test`
- [ ] Coverage ≥ 80% for core modules (enforced by CI)
- [ ] README/CHANGELOG updated if contracts or workflows changed

## Screenshots / Notes (optional)

Include screenshots, logs, or migration notes if helpful.

