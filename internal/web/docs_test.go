package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func docsServer(t *testing.T, webDir string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	registerDocs(mux, webDir)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func noRedirects(t *testing.T) *http.Client {
	t.Helper()
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func TestDocsServesTheBuiltSite(t *testing.T) {
	webDir := t.TempDir()
	for p, body := range map[string]string{
		"docs/index.html":        "docs home",
		"docs/guides/index.html": "guides",
		"docs/static/css/a.css":  "body{}",
	} {
		f := filepath.Join(webDir, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(f, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	srv := docsServer(t, webDir)

	for path, want := range map[string]string{
		"/docs/":                 "docs home",
		"/docs/guides/":          "guides",
		"/docs/static/css/a.css": "body{}",
	} {
		code, body := get(t, srv.URL+path)
		if code != http.StatusOK || body != want {
			t.Errorf("GET %s = %d %q, want 200 %q", path, code, body, want)
		}
	}
	// A folder without an index page is a 404, as App Engine's static_dir
	// gives, not a directory listing.
	for _, path := range []string{"/docs/static/", "/docs/static/css/", "/docs/missing/"} {
		if code, _ := get(t, srv.URL+path); code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, code)
		}
	}
	for path, want := range map[string]string{"/docs": "/docs/", "/docs/guides": "guides/"} {
		resp, err := noRedirects(t).Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if loc := resp.Header.Get("Location"); resp.StatusCode/100 != 3 || loc != want {
			t.Errorf("GET %s = %d to %q, want a redirect to %q", path, resp.StatusCode, loc, want)
		}
	}
}

// The site is a build product (make docs), so a fresh checkout has none. The
// 404 then says how to build it rather than looking like a broken link.
func TestDocsNotBuiltSaysHow(t *testing.T) {
	srv := docsServer(t, t.TempDir())
	code, body := get(t, srv.URL+"/docs/")
	if code != http.StatusNotFound || !strings.Contains(body, "make docs") {
		t.Errorf("GET /docs/ with no build = %d %q, want 404 naming make docs", code, body)
	}
}

func TestRegisterMountsDocs(t *testing.T) {
	srv := newServer(t)
	code, body := get(t, srv.URL+"/docs/")
	built := code == http.StatusOK && strings.Contains(body, "Thambura docs")
	unbuilt := code == http.StatusNotFound && strings.Contains(body, "make docs")
	if !built && !unbuilt {
		t.Errorf("GET /docs/ = %d, want the docs or the note to build them", code)
	}
}
