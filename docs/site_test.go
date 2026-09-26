package main

import (
	"net/http"
	"net/http/httptest"
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

// GitHub Pages takes its custom domain from the build's CNAME file: one
// naming Domain when there is one, and none at all otherwise, since a stray
// CNAME would move the site off panyam.github.io.
func TestBuildCNAMEFollowsDomain(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(out, "CNAME"))
	switch {
	case Domain == "" && err == nil:
		t.Errorf("CNAME = %q with no Domain, want no CNAME file", b)
	case Domain != "" && strings.TrimSpace(string(b)) != Domain:
		t.Errorf("CNAME = %q, %v; want %s", b, err, Domain)
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
	// P is the site's prefix, so the fixture's links are the ones a build has.
	write("index.html", strings.ReplaceAll(`<h2 id="top">x</h2>
<a href="P/guides/">ok</a> <a href="guides/#kits">ok, relative</a> <a href="#top">ok</a> <a href="P/">ok, home</a>
<a href="https://thambura.com/">ok, the app</a> <a href="https://github.com/panyam/thambura">ok, external</a>
<link href="P/static/css/docs.css"> <script src="P/static/js/gen/docs.js"></script>
<a href="P/missing/">no page</a> <a href="#nowhere">no id</a>
<a href="P/guides/#nope">no id there</a> <a href="P/guides">a folder</a>
<a href="P/static/nope.css">no file</a> <a href="">empty</a> <a href="/guides/">unprefixed</a>`, "P", PathPrefix))
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
		`"P/guides" is a folder: end the link with /`,
		`"P/guides/#nope" names an id the page doesn't have`,
		`"P/missing/" goes to nothing`,
		`"P/static/nope.css" goes to nothing`,
	}
	for i := range want {
		want[i] = strings.ReplaceAll(want[i], "P/", PathPrefix+"/")
	}
	if PathPrefix != "" {
		want = append(want, `"/guides/" is outside `+PathPrefix+`/`)
		slices.Sort(want)
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

// make docsrun serves the site where Pages does, so its links work there.
func TestServeAtPrefix(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(serveAt(PathPrefix, http.FileServer(http.Dir(out))))
	defer srv.Close()
	for _, p := range []string{PathPrefix + "/", PathPrefix + "/getting-started/", PathPrefix + "/static/css/docs.css", "/"} {
		resp, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("GET %s = %d, want 200", p, resp.StatusCode)
		}
	}
}
