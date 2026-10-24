.PHONY: install dev test fixtures demo harness predict dwd dwd-refs csv wheel pyodide build serve screenshots robustness

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

# data/synthetic/demo_*.csv behind "Load demo data"
demo:
	uv run python -m harness.demo

# Leaderboard over all models and datasets in configs/eval.yaml, written to runs/<time>_<commit>/
harness:
	uv run python -m harness --config configs/eval.yaml --models all

# Submission without the GUI: every outage of the target filled, challenge format plus a Predicted column.
# MODEL defaults to the recommended model (windgap.models.registry.RECOMMENDED).
# make predict TURBINES=4 [TARGET=... REFERENCES="a.csv b.csv" POWER_CURVE=... MODEL=... OUT=...]
TARGET ?= data/challenge/target.csv
REFERENCES ?= data/challenge/reference.csv
POWER_CURVE ?= data/challenge/power_curve.csv
OUT ?= predictions.csv
predict:
	uv run python -m harness.predict --target $(TARGET) $(addprefix --reference ,$(REFERENCES)) --power-curve $(POWER_CURVE) \
		$(if $(TURBINES),--n-turbines $(TURBINES)) $(if $(MODEL),--model $(MODEL)) --out $(OUT)

# data/dwd/<pair>/: five real DWD station pairs, downloaded from opendata.dwd.de (not checked in)
dwd:
	uv run python -m harness.dwd

# data/dwd_refs/: DWD stations around the challenge farms, Jul–Sep 2026, extra references for app and harness (checked in)
dwd-refs:
	uv run python -m harness.dwd refs

# <name>.csv next to every .xlsx in XLSX (default: the challenge data), readable by the import
XLSX ?= data/data_hackathon_baywa_re
csv:
	uv run python -m harness.xlsx $(XLSX)

# Stable file name: the py worker loads py/windgap.whl.
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

# Realistic uploads (DWD pair, German format, multi-column farm, one year) on both engines, with timings
robustness: build
	npx --prefix web playwright install --only-shell chromium
	node web/scripts/robustness.mjs
