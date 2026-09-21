package web

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"slices"
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
		`<meta name="apple-mobile-web-app-capable" content="yes">`,
		`<meta name="apple-mobile-web-app-title" content="Thambura">`,
		`id="install-app"`,
		`id="install-hint"`,
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

	// The service worker makes the app installable, so it has to be served
	// from the root: a worker only controls pages under its own path. Like
	// app.js it is built, so a clone that hasn't run `make ui` skips this.
	if _, err := os.Stat(filepath.Join("..", "..", "web", "static", "sw.js")); err != nil {
		t.Skip("web/static/sw.js is missing; run `make ui`")
	}
	resp = fetch(t, srv.URL+"/sw.js")
	if resp.code != http.StatusOK || !strings.Contains(resp.contentType, "javascript") {
		t.Errorf("GET /sw.js = %d (%s)", resp.code, resp.contentType)
	}
	if !strings.Contains(resp.body, "addEventListener") {
		t.Error("/sw.js has no event handlers; the browser won't offer to install")
	}
	if cc := resp.cacheControl; !strings.Contains(cc, "no-cache") {
		t.Errorf("/sw.js Cache-Control = %q, want no-cache so updates are picked up", cc)
	}

	resp = fetch(t, srv.URL+"/static/manifest.json")
	var manifest struct {
		Name        string
		StartUrl    string `json:"start_url"`
		Display     string
		Icons       []struct{ Src, Sizes, Purpose string }
		Screenshots []struct {
			Src        string
			Sizes      string
			FormFactor string `json:"form_factor"`
		}
	}
	if err := json.Unmarshal([]byte(resp.body), &manifest); err != nil || manifest.Name == "" {
		t.Fatalf("manifest.json: %v %+v", err, manifest)
	}
	// What a browser needs before it will offer to install.
	if manifest.StartUrl != "/" || manifest.Display != "standalone" {
		t.Errorf("manifest start_url/display = %q/%q", manifest.StartUrl, manifest.Display)
	}
	for _, want := range []string{"192x192", "512x512"} {
		if !slices.ContainsFunc(manifest.Icons, func(i struct{ Src, Sizes, Purpose string }) bool { return i.Sizes == want }) {
			t.Errorf("manifest has no %s icon", want)
		}
	}
	for _, icon := range manifest.Icons {
		if code, _ := get(t, srv.URL+icon.Src); code != http.StatusOK {
			t.Errorf("manifest icon %s = %d", icon.Src, code)
		}
	}
	// Screenshots give the install dialog something to show; each must be
	// served and be the size the manifest claims.
	for _, shot := range manifest.Screenshots {
		resp := fetch(t, srv.URL+shot.Src)
		if resp.code != http.StatusOK {
			t.Errorf("screenshot %s = %d", shot.Src, resp.code)
			continue
		}
		w := binary.BigEndian.Uint32([]byte(resp.body[16:20]))
		h := binary.BigEndian.Uint32([]byte(resp.body[20:24]))
		if got := fmt.Sprintf("%dx%d", w, h); got != shot.Sizes {
			t.Errorf("screenshot %s is %s, manifest says %s", shot.Src, got, shot.Sizes)
		}
	}
	if len(manifest.Screenshots) < 2 {
		t.Error("manifest wants a narrow and a wide screenshot")
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

// `make deploydev` deploys a test copy, which must not turn up in search
// beside thambura.com. It lands on a dev version of the real project by
// default, or in another project altogether.
func TestStagingIsNoindex(t *testing.T) {
	t.Setenv("GOOGLE_CLOUD_PROJECT", "thambura")
	t.Setenv("GAE_VERSION", "dev")
	if !Staging() {
		t.Fatal("Staging() = false on a dev version")
	}
	webDir := filepath.Join("..", "..", "web")
	app, err := NewApp(filepath.Join(webDir, "templates"))
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	mux := http.NewServeMux()
	Register(app, mux, webDir)
	srv := httptest.NewServer(SiteHandler(mux))
	t.Cleanup(srv.Close)

	if got := fetch(t, srv.URL+"/").robots; got != "noindex" {
		t.Errorf("GET /: X-Robots-Tag = %q, want noindex", got)
	}
	if got := fetch(t, srv.URL+"/robots.txt").body; !strings.Contains(got, "Disallow: /") {
		t.Errorf("robots.txt = %q, want Disallow", got)
	}

	// Another project is a test copy however its version is named.
	t.Setenv("GOOGLE_CLOUD_PROJECT", "layagnana")
	t.Setenv("GAE_VERSION", "20260921t120000")
	if !Staging() {
		t.Error("Staging() = false on another project")
	}

	// A version App Engine named itself is the real site, and a server run
	// outside App Engine has neither variable.
	t.Setenv("GOOGLE_CLOUD_PROJECT", "thambura")
	if Staging() {
		t.Error("Staging() = true on a deployed production version")
	}
	t.Setenv("GOOGLE_CLOUD_PROJECT", "")
	t.Setenv("GAE_VERSION", "")
	if Staging() {
		t.Error("Staging() = true outside App Engine")
	}
}

type response struct {
	code         int
	contentType  string
	cacheControl string
	robots       string
	body         string
}

func fetch(t *testing.T, url string) response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return response{resp.StatusCode, resp.Header.Get("Content-Type"), resp.Header.Get("Cache-Control"), resp.Header.Get("X-Robots-Tag"), string(body)}
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

// A kit is a build product that isn't committed (see docs/mridangam.md), so
// the page must only name one when the folder actually holds it. Otherwise
// every visitor's browser asks for a kit.json that isn't there.
func TestFindKit(t *testing.T) {
	static := t.TempDir()
	if got := findKit(static); got != "" {
		t.Fatalf("findKit with no kits = %q, want empty", got)
	}
	dir := filepath.Join(static, "Resources", "Kits", "compmusic")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// A folder without a manifest still counts as no kit.
	if got := findKit(static); got != "" {
		t.Fatalf("findKit with an empty kit folder = %q, want empty", got)
	}
	if err := os.WriteFile(filepath.Join(dir, "kit.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	want := "/static/Resources/Kits/compmusic/kit.json"
	if got := findKit(static); got != want {
		t.Fatalf("findKit = %q, want %q", got, want)
	}
}

// The home page carries the kit URL only when Register found one.
func TestHomePageKitAttribute(t *testing.T) {
	webDir := filepath.Join("..", "..", "web")
	app, err := NewApp(filepath.Join(webDir, "templates"))
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	mux := http.NewServeMux()
	Register(app, mux, webDir)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	_, body := get(t, srv.URL+"/")
	found := app.Context.KitURL
	if has := strings.Contains(body, "data-kit-url="); has != (found != "") {
		t.Fatalf("data-kit-url present = %v, but the kit found at startup was %q", has, found)
	}
}

// A kit is a build product that isn't committed, so this only runs where one
// has been copied in (make devkit). It is the check that the manifest and the
// files agree: takes are named relative to kit.json and live in a folder per
// pack, so a kit copied in flat, or a manifest left pointing at another
// format, serves 404s and the instrument goes silent with no other sign.
func TestStaticServesTheKit(t *testing.T) {
	webDir := filepath.Join("..", "..", "web")
	url := findKit(filepath.Join(webDir, "static"))
	if url == "" {
		t.Skip("no kit under web/static/Resources/Kits; run `make devkit`")
	}
	srv := newServer(t)
	code, body := get(t, srv.URL+url)
	if code != http.StatusOK {
		t.Fatalf("GET %s = %d", url, code)
	}
	var kit struct {
		Strokes []struct {
			ID    string              `json:"id"`
			Takes map[string][]string `json:"takes"`
			// A derived stroke has no recordings: it plays another stroke's
			// takes with a bend, as the gumki plays thom's.
			Derived *struct {
				From string `json:"from"`
			} `json:"derived"`
		} `json:"strokes"`
	}
	if err := json.Unmarshal([]byte(body), &kit); err != nil {
		t.Fatalf("kit.json: %v", err)
	}
	if len(kit.Strokes) == 0 {
		t.Fatal("kit.json names no strokes")
	}
	base := url[:strings.LastIndex(url, "/")+1]
	takes := 0
	sources := map[string]bool{}
	for _, stroke := range kit.Strokes {
		sources[stroke.ID] = len(stroke.Takes) > 0
	}
	for _, stroke := range kit.Strokes {
		if stroke.Derived != nil {
			if !sources[stroke.Derived.From] {
				t.Errorf("stroke %s is derived from %s, which has no takes", stroke.ID, stroke.Derived.From)
			}
			continue
		}
		if len(stroke.Takes) == 0 {
			t.Errorf("stroke %s has no takes", stroke.ID)
		}
		for pack, names := range stroke.Takes {
			for _, name := range names {
				if code, _ := get(t, srv.URL+base+name); code != http.StatusOK {
					t.Errorf("GET %s%s (stroke %s, pack %s) = %d", base, name, stroke.ID, pack, code)
				}
				takes++
			}
		}
	}
	t.Logf("%s: %d strokes, %d takes all served", url, len(kit.Strokes), takes)
}
