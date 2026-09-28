# Thambura developer docs

The site at [panyam.github.io/thambura](https://panyam.github.io/thambura/)
(docs.thambura.com later), built with
[s3gen](https://github.com/panyam/s3gen) and laid out like
[notations' docs](https://github.com/panyam/notations/tree/master/docs).
`designs/` beside it holds the internal design docs, which aren't part of the
site.

```
docs/
  go.mod, main.go   the site's own Go module; `go run . -build` writes dist/
  linkcheck.go      checks every link in a build (site_test.go runs it)
  content/          the pages: index.html, then a folder per section
    SiteMetadata.json    site name, description, links, the embed base, and noindex
    HeaderNavLinks.json  the sections, and each section's pages for the sidebar
  templates/        BasePage, Header, Sidebar, Content, Footer
  components/       DocsPage.ts, the pages' script, bundled into static/js/gen/
  static/           css/docs.css, copied into the build under static/
```

## Writing

```sh
make docsrun               # serves on :8012 (DOCS_PORT=...) and rebuilds on change
make docs                  # builds into docs/dist
make ghpages               # tests, builds and publishes to GitHub Pages
cd docs && go test ./...   # builds the site and checks its links (part of make test)
```

The embed guide's live examples load `embed.js` from `embedBase` in
`SiteMetadata.json` (thambura.com). To try them against a build production
doesn't have yet, point them elsewhere for one run, such as the dev version:
`DOCS_EMBED_BASE=https://dev-dot-thambura.uc.r.appspot.com/static/ make docsrun`.
Publish only once production serves the `embed.js` the guide describes.

A page is Markdown (`.md`) or HTML (`.html`, for pages that need their own
markup) with front matter:

```yaml
---
title: "Add an instrument"
description: "One line, shown under the title and in search results."
prev: { title: "Getting started", url: "/thambura/getting-started/" }
next: { title: "Write a pattern", url: "/thambura/guides/patterns/" }
---
```

- `title` heads the page and its tab; `hideTitle: true` leaves the heading
  to the page (the home page does).
- `prev` and `next` are optional, for guides meant to be read in order.
- A Markdown page's `##` and `###` headings become its "On this page" list.

To add a page, write it under its section's folder
(`content/guides/kits/index.md` is served at `/thambura/guides/kits/`), then list
it in `HeaderNavLinks.json` under the section's `children` so the sidebar shows
it.

Links inside the site start with `{{ .Site.PathPrefix }}/`, in Markdown as
well as templates, and end folders with `/`. The link check fails the build
on anything that goes nowhere, including a `#fragment` with no matching
heading and a link without the prefix. Links to the app are absolute
(`https://thambura.com/`). Front matter isn't templated, so `prev` and `next`
carry the prefix written out.

## Publishing

`make ghpages` runs the docs tests, builds, and force-pushes the build as the
only commit on the `gh-pages` branch, which GitHub Pages serves at
panyam.github.io/thambura. The build carries `.nojekyll`, without which Pages
runs Jekyll over it.

Moving to docs.thambura.com, in this order:

1. Add a CNAME record from `docs` to `panyam.github.io.` at Namecheap (see
   "Deploying" in CLAUDE.md for the API, which replaces every record at once),
   and wait until `docs.thambura.com` resolves.
2. Set `Domain` to `docs.thambura.com` and `PathPrefix` to `""` in `main.go`,
   and drop the `/thambura` from `prev`/`next` front matter. The link check
   finds anything missed.
3. `make ghpages`. The build then carries a `CNAME` file, Pages takes the
   domain from it, redirects panyam.github.io/thambura there, and issues the
   HTTPS certificate. Turn on "Enforce HTTPS" once it has.

The order matters. Pages redirects to the domain as soon as it has one, so a
domain set before DNS resolves sends every visitor to a name that doesn't
exist, and resolvers cache that for an hour (the zone's negative TTL). A DNS
record left pointing at github.io with no Pages site claiming the domain is
the other way round, and lets anyone claim it, so don't add the record long
before step 3.

## Search engines

The site is indexed. `"noindex": true` in `SiteMetadata.json` puts a
`noindex` meta tag on every page, for a preview that shouldn't turn up in
search; `TestPagesAreIndexable` fails while it's on, so it can't be published
that way by accident.
