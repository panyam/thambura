package web

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// registerDocs serves the developer docs (docs/, built by `make docs` into
// web/docs) at /docs/. On App Engine app.yaml serves them itself; this is for
// `make run` and tests, and answers the same way: a folder is served by its
// index.html or not at all, never as a listing.
func registerDocs(mux *http.ServeMux, webDir string) {
	dir := filepath.Join(webDir, "docs")
	files := http.StripPrefix("/docs/", http.FileServer(http.Dir(dir)))
	mux.Handle("/docs/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
			http.Error(w, "The docs aren't built: run make docs.", http.StatusNotFound)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/") {
			rel := filepath.FromSlash(path.Clean(strings.TrimPrefix(r.URL.Path, "/docs/")))
			if _, err := os.Stat(filepath.Join(dir, rel, "index.html")); err != nil {
				http.NotFound(w, r)
				return
			}
		}
		files.ServeHTTP(w, r)
	}))
}
