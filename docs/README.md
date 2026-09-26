# Thambura developer docs

The site at thambura.com/docs, built with
[s3gen](https://github.com/panyam/s3gen) and laid out like
[notations' docs](https://github.com/panyam/notations/tree/master/docs).
`designs/` beside it holds the internal design docs, which aren't part of the
site.

```
docs/
  go.mod, main.go   the site's own Go module; `go run . -build` writes ../web/docs
  linkcheck.go      checks every link in a build (site_test.go runs it)
  content/          the pages: index.html, then a folder per section
    SiteMetadata.json    site name, description, links, and noindex
    HeaderNavLinks.json  the sections, and each section's pages for the sidebar
  templates/        BasePage, Header, Sidebar, Content, Footer
  components/       DocsPage.ts, the pages' script, bundled into static/js/gen/
  static/           css/docs.css, copied into the build as /docs/static/
```

## Writing

```sh
make docsrun               # serves on :8012 (DOCS_PORT=...) and rebuilds on change
make docs                  # builds into web/docs; `make run` then serves it at /docs/
cd docs && go test ./...   # builds the site and checks its links (part of make test)
```

A page is Markdown (`.md`) or HTML (`.html`, for pages that need their own
markup) with front matter:

```yaml
---
title: "Add an instrument"
description: "One line, shown under the title and in search results."
prev: { title: "Getting started", url: "/docs/getting-started/" }
next: { title: "Write a pattern", url: "/docs/guides/patterns/" }
---
```

- `title` heads the page and its tab; `hideTitle: true` leaves the heading
  to the page (the home page does).
- `prev` and `next` are optional, for guides meant to be read in order.
- A Markdown page's `##` and `###` headings become its "On this page" list.

To add a page, write it under its section's folder
(`content/guides/kits/index.md` is served at `/docs/guides/kits/`), then list
it in `HeaderNavLinks.json` under the section's `children` so the sidebar shows
it.

Links inside the site start with `/docs/` and end folders with `/`. The link
check fails the build on anything that goes nowhere, including a `#fragment`
with no matching heading. Links to the app itself are allowed only if they
are listed in `AppPaths` in `linkcheck.go`.

## Search engines

Every page carries `noindex` while `SiteMetadata.json` has `"noindex": true`.
Remove it once the first guides are in, and delete `TestPagesAreNoindex`,
which fails on purpose when the flag goes.
