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
	go build -o bin/sadhana .

build: ui server

run: ui
	PORT=$(PORT) go run .

# Rebuild the bundle on change (run alongside `make run`).
watch:
	cd web && pnpm watch

test:
	go test ./...
	cd web && pnpm typecheck && pnpm test

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

deploy: checklinks test uiprod
	gcloud app deploy --project layagnana --verbosity=info

prodlogs:
	gcloud app logs tail -s default --project layagnana

clean:
	rm -Rf bin locallinks web/static/app.js web/static/app.js.map web/static/css/tailwind.css

.PHONY: all ui uiprod server build run watch test templates resymlink checklinks deploy prodlogs clean
