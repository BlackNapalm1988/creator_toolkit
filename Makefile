PY=python
PIP=pip

.PHONY: install lint fmt deadcode deps audit test ci

install:
	$(PY) -m pip install --upgrade pip
	$(PIP) install -r requirements.txt -r requirements-dev.txt

lint:
	ruff check .

fmt:
	ruff format .

deadcode:
	vulture . scripts/vulture_allowlist.py --min-confidence 70 || true

deps:
	deptry .

audit:
	pip-audit -r requirements.txt -r requirements-dev.txt || true

test:
	pytest -q

ci: install lint deadcode deps audit test
	@echo "CI checks completed"

# Safe prune for bundled static assets
.PHONY: prune-report prune-apply prune-purge

prune-report:
	python scripts/prune_assets.py --report --days 7

prune-apply:
	python scripts/prune_assets.py --apply --days 7

prune-purge:
	python scripts/prune_assets.py --purge --days 14

