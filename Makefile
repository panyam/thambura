NUM_LINKED_GOMODS=`cat go.mod | grep -v "^\/\/" | grep replace | wc -l | sed -e "s/ *//g"`

# 8080 is often taken in dev containers; override with `make run PORT=...`.
PORT ?= 8000

all: build

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

test:
	go test ./...
	cd web && pnpm typecheck && pnpm test

# Copy an instrument kit in from the thambura-data checkout, for local
# listening. Kits are gitignored; DATA overrides where the data repo sits.
DATA ?= ../mridangam-data
KIT ?= compmusic

devkit:
	@test -f $(DATA)/kit/kit.json || { echo "no kit at $(DATA)/kit: run 'make kit' in thambura-data"; exit 1; }
	mkdir -p web/static/Resources/Kits/$(KIT)
	cp $(DATA)/kit/kit.json $(DATA)/kit/*.wav web/static/Resources/Kits/$(KIT)/
	@echo "kit in web/static/Resources/Kits/$(KIT): $$(ls web/static/Resources/Kits/$(KIT) | wc -l) files"

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
	rm -Rf bin locallinks web/static/app.js web/static/app.js.map web/static/sw.js web/static/css/tailwind.css

.PHONY: all ui uiprod server build run watch test templates resymlink checklinks deploy prodlogs verifydomain domains domainstatus clean
