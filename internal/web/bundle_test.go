package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestLoadBundle(t *testing.T) {
	dir := t.TempDir()
	if got := loadBundle(dir); len(got.App.Preload) != 0 {
		t.Fatalf("no manifest: preload = %q, want none", got.App.Preload)
	}
	os.WriteFile(filepath.Join(dir, "bundle.json"), []byte("not json"), 0o644)
	if got := loadBundle(dir); len(got.App.Preload) != 0 {
		t.Fatalf("a broken manifest: preload = %q, want none", got.App.Preload)
	}
	os.WriteFile(filepath.Join(dir, "bundle.json"), []byte(`{"app":{"script":"/static/app.js","preload":["/static/chunks/a.js","/static/chunks/b.js"]}}`), 0o644)
	want := []string{"/static/chunks/a.js", "/static/chunks/b.js"}
	if got := loadBundle(dir); !slices.Equal(got.App.Preload, want) {
		t.Fatalf("preload = %q, want %q", got.App.Preload, want)
	}
	// Only the build's own chunks: anything else in the list is dropped.
	os.WriteFile(filepath.Join(dir, "bundle.json"), []byte(`{"app":{"preload":["/static/chunks/a.js","https://evil.example/x.js","/static/app.js"]}}`), 0o644)
	if got := loadBundle(dir); !slices.Equal(got.App.Preload, []string{"/static/chunks/a.js"}) {
		t.Fatalf("preload = %q, want only the chunk", got.App.Preload)
	}
}

// Every page that runs app.js preloads the chunks it imports, in <head>, so
// the browser fetches them alongside app.js rather than after it.
func TestPagesPreloadTheBundle(t *testing.T) {
	webDir := filepath.Join("..", "..", "web")
	app, err := NewApp(filepath.Join(webDir, "templates"))
	if err != nil {
		t.Fatalf("NewApp: %v", err)
	}
	mux := http.NewServeMux()
	Register(app, mux, webDir)
	app.Context.Bundle = Bundle{App: BundleEntry{Preload: []string{"/static/chunks/chunk-A.js", "/static/chunks/chunk-B.js"}}}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	for _, path := range []string{"/", "/labs/", "/labs/side-by-side"} {
		_, body := get(t, srv.URL+path)
		head := body[:strings.Index(body, "</head>")]
		for _, c := range app.Context.Bundle.App.Preload {
			if !strings.Contains(head, `<link rel="modulepreload" href="`+c+`">`) {
				t.Errorf("%s doesn't preload %s in <head>", path, c)
			}
		}
	}
	app.Context.Bundle = Bundle{}
	if _, body := get(t, srv.URL+"/"); strings.Contains(body, "modulepreload") {
		t.Errorf("/ preloads something with an empty bundle")
	}
}
