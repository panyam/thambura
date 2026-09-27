// Command docs builds Thambura's developer docs with s3gen. They are
// published to GitHub Pages (make ghpages), at panyam.github.io/thambura for
// now and at docs.thambura.com later. `-build` writes the site
// to -out; without it the site is served on -addr and rebuilt on every
// change, for writing.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	s3 "github.com/panyam/s3gen"
)

var (
	addr  = flag.String("addr", ":8012", "Address to serve the docs on while writing")
	build = flag.Bool("build", false, "Build the site into -out and quit")
	out   = flag.String("out", "dist", "Where the built site goes")
)

// Domain is the custom domain GitHub Pages serves the site on, written into
// the build as the CNAME file Pages reads; empty serves it at
// panyam.github.io/thambura. Moving to docs.thambura.com means setting Domain
// to it and PathPrefix to "", once DNS has a CNAME from docs to
// panyam.github.io (see docs/README.md, "Publishing", for the order).
const Domain = ""

// PathPrefix is where the site sits on its host. Every link goes through
// {{ .Site.PathPrefix }}, in the templates and the content alike, and the link
// check fails on one that doesn't.
const PathPrefix = "/thambura"

// The app's favicons, copied in so the docs carry the same icon without a
// second copy in the repo.
var favicons = []string{"favicon.ico", "favicon.svg"}

// EmbedBase is where the embed guide's live examples load embed.js from:
// the folder it's in, ending in a slash. It's SiteMetadata.json's embedBase
// (thambura.com), or DOCS_EMBED_BASE to try the examples against another
// server, such as a `make deploydev` version, before production has the
// build they need.
func EmbedBase() (string, error) {
	if base := os.Getenv("DOCS_EMBED_BASE"); base != "" {
		return strings.TrimSuffix(base, "/") + "/", nil
	}
	b, err := os.ReadFile(filepath.Join("content", "SiteMetadata.json"))
	if err != nil {
		return "", err
	}
	var meta struct {
		EmbedBase string `json:"embedBase"`
	}
	if err := json.Unmarshal(b, &meta); err != nil {
		return "", err
	}
	if meta.EmbedBase == "" {
		return "", fmt.Errorf("SiteMetadata.json has no embedBase")
	}
	return strings.TrimSuffix(meta.EmbedBase, "/") + "/", nil
}

// NewSite returns the docs site, writing to outDir. It is read from the docs
// folder, so run it from there.
func NewSite(outDir string) *s3.Site {
	return &s3.Site{
		OutputDir:       outDir,
		ContentRoot:     "./content",
		PathPrefix:      PathPrefix,
		TemplateFolders: []string{"./templates"},
		StaticFolders:   []string{"/static/", "./static"},
		DefaultBaseTemplate: s3.BaseTemplate{
			Name:   "BasePage.html",
			Params: map[any]any{"BodyTemplateName": "Content"},
		},
		CommonFuncMap: map[string]any{"embedBase": EmbedBase},
		// The site's data files are read by templates (json "..."), not pages.
		IgnoreFileFunc: func(path string) bool {
			return filepath.Ext(path) == ".json"
		},
	}
}

// Build writes the whole site to outDir, replacing what was there, ready to
// publish as it is: the pages, the static folder (s3gen only serves static
// folders itself, so a build served by something else has to carry them), the
// app's favicons, and GitHub Pages' CNAME (with a Domain) and .nojekyll (without which Pages
// runs Jekyll over the site and drops anything starting with an underscore).
func Build(outDir string) error {
	if err := os.RemoveAll(outDir); err != nil {
		return err
	}
	NewSite(outDir).Rebuild(nil)
	if err := templateErrors(outDir); err != nil {
		return err
	}
	if err := os.CopyFS(filepath.Join(outDir, "static"), os.DirFS("static")); err != nil {
		return err
	}
	if err := copyFavicons(outDir); err != nil {
		return err
	}
	if Domain != "" {
		if err := os.WriteFile(filepath.Join(outDir, "CNAME"), []byte(Domain+"\n"), 0o644); err != nil {
			return err
		}
	}
	return os.WriteFile(filepath.Join(outDir, ".nojekyll"), nil, 0o644)
}

// serveAt serves h under prefix, as Pages does, so the site's links work
// while writing; anything outside it is sent to the prefix.
func serveAt(prefix string, h http.Handler) http.Handler {
	if prefix == "" {
		return h
	}
	mux := http.NewServeMux()
	mux.Handle(prefix+"/", http.StripPrefix(prefix, h))
	mux.Handle("/", http.RedirectHandler(prefix+"/", http.StatusFound))
	return mux
}

// copyFavicons puts the app's favicons at the site's root, for Build and for
// docsrun, which serves the pages s3gen writes without Build's extras.
func copyFavicons(outDir string) error {
	for _, f := range favicons {
		b, err := os.ReadFile(filepath.Join("..", "web", "static", f))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(outDir, f), b, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// templateErrors fails a build that s3gen finished without complaint. When a
// page's template fails, s3gen logs it and writes the error into the page as
// "... Template error: ...", so the only sign is in the output.
func templateErrors(outDir string) error {
	var bad []string
	err := filepath.WalkDir(outDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(path) != ".html" {
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if i := bytes.Index(b, []byte("Template error: ")); i >= 0 {
			line, _, _ := bytes.Cut(b[i:], []byte("\n"))
			bad = append(bad, fmt.Sprintf("%s: %s", path, line))
		}
		return nil
	})
	if err != nil {
		return err
	}
	if len(bad) > 0 {
		return fmt.Errorf("pages failed to render:\n%s", strings.Join(bad, "\n"))
	}
	return nil
}

func main() {
	flag.Parse()
	if *build {
		if err := Build(*out); err != nil {
			log.Fatal(err)
		}
		return
	}
	site := NewSite(*out)
	site.Rebuild(nil)
	if err := copyFavicons(*out); err != nil {
		log.Fatal(err)
	}
	site.Watch()
	log.Printf("Serving the docs on %s%s/", *addr, PathPrefix)
	log.Fatal(http.ListenAndServe(*addr, serveAt(PathPrefix, site)))
}
