NUM_LINKED_GOMODS=`cat go.mod | grep -v "^\/\/" | grep replace | wc -l | sed -e "s/ *//g"`

# 8080 is often taken in dev containers; override with `make run PORT=...`.
PORT ?= 8000

all: build

# The Python tools (tools/sound-analysis) run in a venv. One venv is shared by
# every worktree and by the thambura-data checkout, since they all sit under
# the same parent; override with VENV=... to put it elsewhere.
VENV ?= ../.venv
PY = $(VENV)/bin/python

setupvenv:
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(VENV)/bin/pip install -q -r tools/sound-analysis/requirements.txt
	@echo "venv ready: $(VENV)"
	@echo "make targets use it as is. To activate it in this shell:"
	@echo "    source $(VENV)/bin/activate"

# Prints the venv path, for `source "$$(make -s venvpath)"/bin/activate`.
venvpath:
	@echo $(VENV)

# Frontend: install deps, compile Tailwind, bundle the TS (web/static/app.js).
ui:
	cd web && pnpm install && pnpm buildcss && pnpm build

uiprod:
	cd web && pnpm install && pnpm buildcssprod && pnpm build

server:
	go build -o bin/thambura .

build: ui server

run: ui
	PORT=$(PORT) go run .

# Rebuild the bundle on change (run alongside `make run`).
watch:
	cd web && pnpm watch

test: liftcheck
	go test ./...
	cd web && pnpm typecheck && pnpm patterns:check && pnpm test && pnpm buildcheck
	cd web && pnpm exec tsc -p ../docs/components
	cd docs && go test ./...

# internal/page and web/src/page are meant to move into goapplib and tsappkit
# (#86), so they may import nothing else from this repo. Keeping it that way is
# what makes the lift a copy.
# The developer docs (docs/), published to GitHub Pages at docs.thambura.com.
# The site is its own Go module, so s3gen stays out of the app's build; `make
# test` builds it and checks every link. docs writes it to docs/dist; docsrun
# serves it on DOCS_PORT and rebuilds on change, for writing.
DOCS_PORT ?= 8012

docs: docsjs
	cd docs && go run . -build

docsrun: docsjs
	@! ss -ltn | grep -q ':$(DOCS_PORT) ' || { echo "port $(DOCS_PORT) is taken: make docsrun DOCS_PORT=..."; exit 1; }
	cd docs && go run . -addr :$(DOCS_PORT)

# Publish: the gh-pages branch holds only the built site, one commit, pushed
# over whatever it had. Pages serves it a minute or so later.
ghpages: docs
	cd docs && go test ./...
	cd docs/dist && rm -rf .git && git init -q -b gh-pages && git add -A && \
		git commit -q -m "Docs from $$(git -C ../.. describe --always --dirty)" && \
		git push -q -f "$$(git -C ../.. remote get-url origin)" gh-pages && rm -rf .git

# The docs' script, checked and bundled with the app's TypeScript and esbuild.
docsjs:
	cd web && pnpm install && pnpm exec tsc -p ../docs/components && \
		NODE_PATH=$$PWD/node_modules pnpm exec esbuild ../docs/components/DocsPage.ts \
		--bundle --format=esm --minify --outfile=../docs/static/js/gen/docs.js

liftcheck:
	@bad=$$(go list -deps ./internal/page | grep '^github.com/panyam/thambura/' | grep -v '^github.com/panyam/thambura/internal/page$$'); \
	  if [ -n "$$bad" ]; then echo "internal/page imports from this repo: $$bad"; exit 1; fi
	@bad=$$(grep -rnE "from ['\"]\.\./" web/src/page || true); \
	  if [ -n "$$bad" ]; then echo "web/src/page imports from outside itself:"; echo "$$bad"; exit 1; fi

# The sound-analysis tools (docs/designs/sound-analysis.md). Kept out of `test`, and so
# out of `deploy`, since they need a Python env the app itself never uses. The
# venv is shared and sits outside the worktree, so the recipe calls it by
# absolute path: $(PY) is relative to the repo root, and this cds below it.
soundtest: | setupvenv
	cd tools/sound-analysis && $(abspath $(PY)) -m pytest -q && $(abspath $(PY)) tables.py --check

# Copy an instrument kit in from the thambura-data checkout, for local
# listening. Kits are gitignored; DATA overrides where the data repo sits,
# and KITSRC picks the compressed copy (kit-aac) or the master WAVs (kit).
DATA ?= ../mridangam-data
KITSRC ?= kit-flac
KIT ?= compmusic

devkit:
	@test -f $(DATA)/$(KITSRC)/kit.json || { echo "no kit at $(DATA)/$(KITSRC): run 'make kit' in thambura-data"; exit 1; }
	rm -rf web/static/Resources/Kits/$(KIT)
	mkdir -p web/static/Resources/Kits
	cp -R $(DATA)/$(KITSRC) web/static/Resources/Kits/$(KIT)
	@echo "kit in web/static/Resources/Kits/$(KIT): $$(find web/static/Resources/Kits/$(KIT) -type f | wc -l) files, $$(du -sh web/static/Resources/Kits/$(KIT) | cut -f1)"

# Re-vendor goapplib's templates after bumping the ref in web/templates/templar.yaml.
templates:
	cd web/templates && templar get

resymlink:
	mkdir -p locallinks
	rm -Rf locallinks/*
	cd locallinks && ln -s ~/newstack

checklinks:
	@if [ x"${NUM_LINKED_GOMODS}" != "x0" ]; then	\
		echo "You are trying to deploy with symlinks. Remove them first and make sure versions exist" && false ;	\
	fi

# App Engine project and the custom domains mapped to it.
GCP_PROJECT ?= thambura
DOMAINS ?= thambura.com www.thambura.com

# Deploy to App Engine (https://thambura.appspot.com, https://thambura.com).
# Tests and a production frontend build run first, and checklinks refuses to
# ship with local replace directives.
deploy: checklinks test uiprod server
	gcloud app deploy app.yaml --project $(GCP_PROJECT) --verbosity=info

prodlogs:
	gcloud app logs tail -s default --project $(GCP_PROJECT)

# Try a deploy before the real one: the same build, sent to a "dev" version of
# the same project, which takes no traffic and has its own URL (printed at the
# end). That way the test copy runs against the project the site really runs
# in. The version id is reused, so dev deploys don't pile up, and the app marks
# a dev version noindex so it can't turn up in search. DEV_PROJECT sends it to
# a separate project instead (layagnana has an App Engine app, still serving
# the 2016 site at its root).
DEV_PROJECT ?= $(GCP_PROJECT)
DEV_VERSION ?= dev
PROMOTE ?=

# Traffic only moves with PROMOTE=1, and never in the project serving
# thambura.com: `make deploy` is the way to put a build there. The check runs
# before the tests, so a refused deploy is refused at once.
checkpromote:
	@test -z "$(PROMOTE)" || test "$(DEV_PROJECT)" != "$(GCP_PROJECT)" || \
		{ echo "PROMOTE=1 would put this build on thambura.com: run 'make deploy'"; exit 1; }

deploydev: checkpromote checklinks test uiprod server
	gcloud app deploy app.yaml --project $(DEV_PROJECT) --version=$(DEV_VERSION) \
		$(if $(PROMOTE),--promote,--no-promote) --verbosity=info
	@echo "== $$(gcloud app versions describe $(DEV_VERSION) --service=default \
		--project $(DEV_PROJECT) --format='value(versionUrl)')"

devlogs:
	gcloud app logs tail -s default --project $(DEV_PROJECT)

# One-time domain setup, see "Deploying" in CLAUDE.md. verifydomain opens
# Search Console to prove ownership (a TXT record at the registrar); domains
# then maps each name and prints the A/AAAA/CNAME records to add there.
verifydomain:
	gcloud domains verify thambura.com

# Safe to rerun: an existing mapping is left alone and its records reprinted.
domains:
	for d in $(DOMAINS); do \
		if gcloud app domain-mappings describe $$d --project $(GCP_PROJECT) >/dev/null 2>&1; then \
			echo "== $$d already mapped"; \
		else \
			gcloud app domain-mappings create $$d --certificate-management=AUTOMATIC --project $(GCP_PROJECT) >/dev/null || exit 1; \
			echo "== $$d mapped"; \
		fi; \
		gcloud app domain-mappings describe $$d --project $(GCP_PROJECT) --format='table(resourceRecords.type, resourceRecords.rrdata)' --flatten=resourceRecords || exit 1; \
	done

domainstatus:
	gcloud app domain-mappings list --project $(GCP_PROJECT)

clean:
	rm -Rf bin locallinks web/static/app.js web/static/app.js.map web/static/sw.js web/static/css/tailwind.css docs/dist docs/static/js/gen

.PHONY: all setupvenv venvpath ui uiprod server build run watch test docs docsrun docsjs ghpages liftcheck soundtest templates resymlink checklinks deploy prodlogs checkpromote deploydev devlogs verifydomain domains domainstatus clean
