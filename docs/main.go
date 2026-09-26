// Command docs builds Thambura's developer docs with s3gen. They are
// published to GitHub Pages at Domain (make ghpages). `-build` writes the site
// to -out; without it the site is served on -addr and rebuilt on every
// change, for writing.
package main

import (
	"bytes"
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

// Domain is where GitHub Pages serves the site, written into the build as
// the CNAME file Pages reads. DNS points it at panyam.github.io.
const Domain = "docs.thambura.com"

// PathPrefix is where the site sits on Domain, which is its root. Templates
// still write links as {{.Site.PathPrefix}}/..., so moving the site under a
// path (panyam.github.io/thambura, say) is a change here and in the content's
// own links, which the link check finds.
const PathPrefix = ""

// The app's favicons, copied in so the docs carry the same icon without a
// second copy in the repo.
var favicons = []string{"favicon.ico", "favicon.svg"}

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
		// The site's data files are read by templates (json "..."), not pages.
		IgnoreFileFunc: func(path string) bool {
			return filepath.Ext(path) == ".json"
		},
	}
}

// Build writes the whole site to outDir, replacing what was there, ready to
// publish as it is: the pages, the static folder (s3gen only serves static
// folders itself, so a build served by something else has to carry them), the
// app's favicons, and GitHub Pages' CNAME and .nojekyll (without which Pages
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
	for _, f := range favicons {
		b, err := os.ReadFile(filepath.Join("..", "web", "static", f))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(outDir, f), b, 0o644); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(outDir, "CNAME"), []byte(Domain+"\n"), 0o644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(outDir, ".nojekyll"), nil, 0o644)
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
	site.Watch()
	log.Printf("Serving the docs on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, site))
}
