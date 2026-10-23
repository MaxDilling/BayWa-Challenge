.PHONY: install dev test fixtures demo harness wheel pyodide build serve screenshots

install:
	uv sync
	npm --prefix web ci

dev: wheel pyodide
	npm --prefix web run dev

test: wheel pyodide
	uv run pytest
	npm --prefix web test

# Regenerate after any change to a model, energy, metrics or engine.py; commit the result.
fixtures:
	uv run python -m harness.fixtures

# Stable file name: the py worker loads py/windgap.whl.
# data/synthetic/demo_*.csv behind "Load demo data"
demo:
	uv run python -m harness.demo

# Leaderboard over all models and datasets in configs/eval.yaml, written to runs/<time>_<commit>/
harness:
	uv run python -m harness --config configs/eval.yaml --models all

wheel:
	rm -rf web/public/py
	uv build --wheel --out-dir web/public/py
	mv web/public/py/windgap-*.whl web/public/py/windgap.whl

pyodide:
	node web/scripts/fetch-pyodide.mjs

# dist/windgap.html (single file, ts engine) and dist/windgap-web/ (both engines, needs http://)
build: wheel pyodide
	npm --prefix web run build
	rm -rf dist && mkdir -p dist
	cp -R web/dist/web dist/windgap-web
	cp web/dist/single/index.html dist/windgap.html
	cp dist/windgap.html dist/windgap-web/windgap.html

serve: build
	cd dist/windgap-web && python3 -m http.server 8000

# screenshots/: every GUI step on desktop, mobile and dark, an upload error and the py engine
screenshots: build
	npx --prefix web playwright install --only-shell chromium
	node web/scripts/screenshots.mjs
