package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The gate for the docs: the real site builds without a template error and
// every link in it lands somewhere.
func TestSiteBuildsWithNoBrokenLinks(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	broken, err := CheckLinks(out)
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range broken {
		t.Error(b)
	}
	for _, p := range []string{"index.html", "getting-started/index.html", "guides/index.html", "reference/index.html", "static/css/docs.css", "favicon.svg", ".nojekyll"} {
		if _, err := os.Stat(filepath.Join(out, p)); err != nil {
			t.Errorf("built site has no %s", p)
		}
	}
}

// GitHub Pages serves the site at Domain only if the build carries a CNAME
// file naming it; without one, a publish drops the custom domain.
func TestBuildNamesTheDomain(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(out, "CNAME"))
	if err != nil || strings.TrimSpace(string(b)) != "docs.thambura.com" {
		t.Errorf("CNAME = %q, %v; want docs.thambura.com", b, err)
	}
}

// Until the first guides land (#95), every page asks search engines to stay
// away. This fails once SiteMetadata.json drops noindex, as a reminder to
// delete it.
func TestPagesAreNoindex(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"index.html", "guides/index.html"} {
		b, _ := os.ReadFile(filepath.Join(out, p))
		if !strings.Contains(string(b), `<meta name="robots" content="noindex">`) {
			t.Errorf("%s is not noindex", p)
		}
	}
}

func TestCheckLinksFindsEachKindOfBrokenLink(t *testing.T) {
	out := t.TempDir()
	write := func(p, s string) {
		t.Helper()
		f := filepath.Join(out, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(f, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", `<h2 id="top">x</h2>
<a href="/guides/">ok</a> <a href="guides/#kits">ok, relative</a> <a href="#top">ok</a> <a href="/">ok, home</a>
<a href="https://thambura.com/">ok, the app</a> <a href="https://github.com/panyam/thambura">ok, external</a>
<link href="/static/css/docs.css"> <script src="/static/js/gen/docs.js"></script>
<a href="/missing/">no page</a> <a href="#nowhere">no id</a>
<a href="/guides/#nope">no id there</a> <a href="/guides">a folder</a>
<a href="/static/nope.css">no file</a> <a href="">empty</a>`)
	write("guides/index.html", `<h2 id="kits">Kits</h2> <a href="../">ok, up</a>`)
	write("static/css/docs.css", `body {}`)

	broken, err := CheckLinks(out)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, b := range broken {
		_, link, _ := strings.Cut(b, ": ")
		got = append(got, link)
	}
	slices.Sort(got)
	want := []string{
		`"" is empty`,
		`"#nowhere" names an id the page doesn't have`,
		`"/guides" is a folder: end the link with /`,
		`"/guides/#nope" names an id the page doesn't have`,
		`"/missing/" goes to nothing`,
		`"/static/nope.css" goes to nothing`,
	}
	if !slices.Equal(got, want) {
		t.Errorf("CheckLinks =\n  %s\nwant\n  %s", strings.Join(got, "\n  "), strings.Join(want, "\n  "))
	}
}

func TestTemplateErrorsFailTheBuild(t *testing.T) {
	out := t.TempDir()
	if err := os.WriteFile(filepath.Join(out, "a.html"), []byte("<p>ok</p>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := templateErrors(out); err != nil {
		t.Fatalf("clean output: %v", err)
	}
	if err := os.WriteFile(filepath.Join(out, "b.html"), []byte("MD Template error: template: no such function\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := templateErrors(out); err == nil || !strings.Contains(err.Error(), "b.html") {
		t.Fatalf("templateErrors = %v, want an error naming b.html", err)
	}
}
