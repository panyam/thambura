// Command thambura serves the Thambura web app.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/panyam/thambura/internal/brand"
	"github.com/panyam/thambura/internal/web"
)

func main() {
	webDir := flag.String("web", envOr("THAMBURA_WEB_DIR", "web"), "folder holding templates/ and static/")
	flag.Parse()

	// App Engine sets PORT; locally default to 8080 on all interfaces so the
	// server is reachable through a container's published port.
	addr := ":" + envOr("PORT", "8080")

	app, err := web.NewApp(filepath.Join(*webDir, "templates"))
	if err != nil {
		log.Fatalf("loading templates: %v", err)
	}
	if missing := web.MissingAssets(*webDir); len(missing) > 0 {
		log.Printf("warning: frontend not built (missing %v); run `make ui`", missing)
	}

	mux := http.NewServeMux()
	web.Register(app, mux, *webDir)

	log.Printf("%s listening on %s", brand.Name, addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
