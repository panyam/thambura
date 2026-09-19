package web

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// newServer serves the real web/ folder, so the test covers the templar
// config, the vendored goapplib templates and our overrides together.
func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	webDir := filepath.Join("..", "..", "web")
	app, err := NewApp(filepath.Join(webDir, "templates"))
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	mux := http.NewServeMux()
	Register(app, mux, webDir)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func TestHomePageRenders(t *testing.T) {
	srv := newServer(t)
	code, body := get(t, srv.URL+"/")
	if code != http.StatusOK {
		t.Fatalf("GET / = %d, body:\n%s", code, body)
	}
	for _, want := range []string{
		"<title>" + homeTitle + "</title>",
		`<link rel="canonical" href="https://thambura.com/">`,
		`id="player"`,
		`id="theme-toggle-button"`,
		`src="/static/app.js"`,
		`href="/static/css/tailwind.css"`,
		`href="/legacy/"`,
		`id="thambura-toggle"`,
		`id="thambura-play"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("home page missing %q", want)
		}
	}
	for _, unwanted := range []string{"/login", "htmx.org", "header-actions-drawer"} {
		if strings.Contains(body, unwanted) {
			t.Errorf("home page should not contain %q", unwanted)
		}
	}
}

// What link-preview bots and search engines read from the head.
func TestHomePageMetadata(t *testing.T) {
	srv := newServer(t)
	_, body := get(t, srv.URL+"/")
	for _, want := range []string{
		`<meta name="description" content="` + homeDescription + `">`,
		`<meta property="og:title" content="` + homeTitle + `">`,
		`<meta property="og:url" content="https://thambura.com/">`,
		`<meta property="og:image" content="https://thambura.com/static/og.png">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<link rel="manifest" href="/static/manifest.json">`,
		`<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">`,
		`<h1 id="about-heading"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("home page missing %q", want)
		}
	}
	if n := len(homeDescription); n > 170 {
		t.Errorf("description is %d characters; results cut it off past about 160", n)
	}
	if !strings.Contains(body, `<meta property="og:description" content="`+homeSocialDescription+`">`) {
		t.Error("the preview doesn't use the short description")
	}
	if n := len(homeSocialDescription); n > 125 {
		t.Errorf("preview description is %d characters; previews cut it off past about 125", n)
	}

	m := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)
	if m == nil {
		t.Fatal("home page has no JSON-LD")
	}
	var ld map[string]any
	if err := json.Unmarshal([]byte(m[1]), &ld); err != nil {
		t.Fatalf("JSON-LD doesn't parse: %v\n%s", err, m[1])
	}
	if ld["@type"] != "WebApplication" || ld["url"] != "https://thambura.com/" || ld["isAccessibleForFree"] != true {
		t.Errorf("JSON-LD = %v", ld)
	}
}

// The files crawlers and browsers ask for at the root, and the manifest's icons.
func TestRootFiles(t *testing.T) {
	srv := newServer(t)
	resp := fetch(t, srv.URL+"/robots.txt")
	if !strings.Contains(resp.body, "Sitemap: https://thambura.com/sitemap.xml") || !strings.Contains(resp.body, "Allow: /") {
		t.Errorf("robots.txt = %q", resp.body)
	}
	resp = fetch(t, srv.URL+"/sitemap.xml")
	if !strings.Contains(resp.body, "<loc>https://thambura.com/</loc>") || !strings.HasPrefix(resp.contentType, "application/xml") {
		t.Errorf("sitemap.xml (%s) = %q", resp.contentType, resp.body)
	}
	resp = fetch(t, srv.URL+"/favicon.ico")
	if resp.code != http.StatusOK || !strings.HasPrefix(resp.body, "\x00\x00\x01\x00") {
		t.Errorf("favicon.ico = %d, not an icon file", resp.code)
	}

	resp = fetch(t, srv.URL+"/static/manifest.json")
	var manifest struct {
		Name  string
		Icons []struct{ Src string }
	}
	if err := json.Unmarshal([]byte(resp.body), &manifest); err != nil || manifest.Name == "" || len(manifest.Icons) == 0 {
		t.Fatalf("manifest.json: %v %+v", err, manifest)
	}
	for _, icon := range manifest.Icons {
		if code, _ := get(t, srv.URL+icon.Src); code != http.StatusOK {
			t.Errorf("manifest icon %s = %d", icon.Src, code)
		}
	}

	// The preview image is the size og:image:width/height promise.
	resp = fetch(t, srv.URL+"/static/og.png")
	if len(resp.body) < 24 || resp.body[1:4] != "PNG" {
		t.Fatalf("og.png = %d, not a PNG", resp.code)
	}
	w := binary.BigEndian.Uint32([]byte(resp.body[16:20]))
	h := binary.BigEndian.Uint32([]byte(resp.body[20:24]))
	if w != 1200 || h != 630 {
		t.Errorf("og.png is %dx%d, want 1200x630", w, h)
	}
}

func TestLegacyIsNoindex(t *testing.T) {
	srv := newServer(t)
	for _, p := range []string{"/legacy/", "/legacy/static/js/lgview.js"} {
		if got := fetch(t, srv.URL+p).robots; got != "noindex" {
			t.Errorf("GET %s: X-Robots-Tag = %q, want noindex", p, got)
		}
	}
	if got := fetch(t, srv.URL+"/").robots; got != "" {
		t.Errorf("GET /: X-Robots-Tag = %q, want none", got)
	}
}

type response struct {
	code        int
	contentType string
	robots      string
	body        string
}

func fetch(t *testing.T, url string) response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return response{resp.StatusCode, resp.Header.Get("Content-Type"), resp.Header.Get("X-Robots-Tag"), string(body)}
}

func TestUnknownPathIs404(t *testing.T) {
	srv := newServer(t)
	if code, _ := get(t, srv.URL+"/apps/"); code != http.StatusNotFound {
		t.Errorf("GET /apps/ = %d, want 404", code)
	}
}

// Every sound and image the fixtures name is served.
func TestStaticServesResources(t *testing.T) {
	checkFixtureAssets(t, newServer(t), "/static/")
}

// checkFixtureAssets fetches the TalasFixtures.json under root and every
// asset path it names, which must all lie under root.
func checkFixtureAssets(t *testing.T, srv *httptest.Server, root string) {
	t.Helper()
	code, fixtures := get(t, srv.URL+root+"Resources/TalasFixtures.json")
	if code != http.StatusOK {
		t.Fatalf("GET %sResources/TalasFixtures.json = %d", root, code)
	}
	paths := regexp.MustCompile(`"(/[^"]+)"`).FindAllStringSubmatch(fixtures, -1)
	if len(paths) == 0 {
		t.Fatal("fixtures name no assets")
	}
	for _, m := range paths {
		if !strings.HasPrefix(m[1], root) {
			t.Errorf("fixtures path %q is outside %s", m[1], root)
		} else if code, _ := get(t, srv.URL+m[1]); code != http.StatusOK {
			t.Errorf("GET %s = %d", m[1], code)
		}
	}
}

// The 2016 app is served whole: its page, its scripts and the assets its
// fixtures name, all under /legacy/.
func TestLegacyServesOldApp(t *testing.T) {
	srv := newServer(t)
	code, body := get(t, srv.URL+"/legacy/")
	if code != http.StatusOK {
		t.Fatalf("GET /legacy/ = %d", code)
	}
	for _, want := range []string{"<title>LayaGnana", `src="/legacy/static/js/lgview.js"`} {
		if !strings.Contains(body, want) {
			t.Errorf("legacy page missing %q", want)
		}
	}
	checkFixtureAssets(t, srv, "/legacy/static/")
}

func TestMissingAssets(t *testing.T) {
	dir := t.TempDir()
	if got := MissingAssets(dir); len(got) != 2 {
		t.Fatalf("empty dir: missing = %v, want both assets", got)
	}
	os.MkdirAll(filepath.Join(dir, "static", "css"), 0o755)
	os.WriteFile(filepath.Join(dir, "static", "app.js"), nil, 0o644)
	os.WriteFile(filepath.Join(dir, "static", "css", "tailwind.css"), nil, 0o644)
	if got := MissingAssets(dir); len(got) != 0 {
		t.Errorf("built dir: missing = %v, want none", got)
	}
}
