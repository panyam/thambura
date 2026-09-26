// Command docs builds Thambura's developer docs (thambura.com/docs) with
// s3gen. `-build` writes the site to ../web/docs, where the app's Go server
// and app.yaml serve it; without it the site is served on -addr and rebuilt
// on every change, for writing.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	s3 "github.com/panyam/s3gen"
)

var (
	addr  = flag.String("addr", ":8012", "Address to serve the docs on while writing")
	build = flag.Bool("build", false, "Build the site into -out and quit")
	out   = flag.String("out", "../web/docs", "Where the built site goes")
)

// PathPrefix is where the site is mounted on thambura.com. Every link in the
// templates and content goes through {{.Site.PathPrefix}} or starts with it.
const PathPrefix = "/docs"

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

// Build writes the whole site to outDir, replacing what was there, with the
// static folder copied in beside the pages. s3gen only serves static folders
// itself, so a build that is served by something else has to carry them.
func Build(outDir string) error {
	if err := os.RemoveAll(outDir); err != nil {
		return err
	}
	NewSite(outDir).Rebuild(nil)
	if err := templateErrors(outDir); err != nil {
		return err
	}
	return os.CopyFS(filepath.Join(outDir, "static"), os.DirFS("static"))
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
	log.Fatal(site.Serve(*addr))
}
