package main

import (
	"encoding/json"
	"html"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
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

// The published site is indexed (#95 took noindex off once the first
// guides were in), so no page may ask search engines to stay away. The
// switch stays in SiteMetadata.json for a preview; this catches it left on.
var robotsNoindex = regexp.MustCompile(`<meta name="robots"[^>]*noindex`)

func TestPagesAreIndexable(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	err := filepath.WalkDir(out, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(p) != ".html" {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if robotsNoindex.Match(b) {
			t.Errorf("%s asks search engines not to index it", p)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
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

// The embed guide's live examples are specs in the built page: declared
// ones in data-thambura-spec scripts, mount() ones in data-embed-example
// attributes. Each must parse, name islands embed.js has, and have a slot on
// the page for every island, or the example shows nothing and nobody notices.
func TestEmbedExamplesAreMountable(t *testing.T) {
	out := t.TempDir()
	if err := Build(out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(out, "guides", "embed", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	page := string(b)
	var specs []string
	for _, m := range regexp.MustCompile(`(?s)<script type="application/json" data-thambura-spec>(.*?)</script>`).FindAllStringSubmatch(page, -1) {
		specs = append(specs, m[1])
	}
	for _, m := range regexp.MustCompile(`data-embed-example='([^']*)'`).FindAllStringSubmatch(page, -1) {
		specs = append(specs, html.UnescapeString(m[1]))
	}
	if len(specs) < 3 {
		t.Fatalf("found %d example specs, want the tala, the thambura and both", len(specs))
	}
	known := map[string]bool{"tala": true, "thambura": true, "session": true, "tracks": true}
	for _, text := range specs {
		var spec struct {
			Islands []struct{ Name, Slot string }
		}
		if err := json.Unmarshal([]byte(text), &spec); err != nil || len(spec.Islands) == 0 {
			t.Errorf("example spec %q doesn't read as a spec with islands: %v", text, err)
			continue
		}
		for _, is := range spec.Islands {
			if !known[is.Name] {
				t.Errorf("example spec %q names island %q, which embed.js doesn't have", text, is.Name)
			}
			if !strings.Contains(page, `data-thambura-slot="`+is.Slot+`"`) {
				t.Errorf("example spec %q wants slot %q, which isn't on the page", text, is.Slot)
			}
		}
	}
	base, err := EmbedBase()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(page, `src="`+base+`embed.js"`) || !strings.Contains(page, `data-embed-base="`+base+`"`) {
		t.Errorf("the page doesn't load embed.js from %s", base)
	}
}
