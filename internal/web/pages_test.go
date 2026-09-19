package web

import (
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
		"<title>Thambura</title>",
		`id="player"`,
		`id="theme-toggle-button"`,
		`src="/static/app.js"`,
		`href="/static/css/tailwind.css"`,
		`href="/legacy/"`,
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
