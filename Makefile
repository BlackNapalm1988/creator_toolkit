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

