// Package web serves Thambura's pages: goapplib page shells rendered through
// templar, each hosting a Solid island. The pages own no data; everything the
// player needs (sounds, images, tala fixtures) is fetched from /static by the
// browser. /legacy/ serves the original 2016 app, untouched but for its paths.
package web

import (
	"html/template"
	"net/http"
	"os"
	"path/filepath"

	goal "github.com/panyam/goapplib"
	tmplr "github.com/panyam/templar"

	"github.com/panyam/thambura/internal/brand"
)

// App is the goapplib app context. Empty for now; the pages need no server
// state.
type App struct{}

// Header is the data goapplib's Header template renders with.
type Header struct {
	AppName string
}

// HomePage is the practice page: a shell for the player island.
type HomePage struct {
	goal.BasePage
	Header Header
}

// Load implements the goapplib View.
func (p *HomePage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	p.Title = brand.Name
	p.MetaDescription = brand.Name + ": a practice companion for Carnatic music (tala keeper)."
	p.DisableSplashScreen = true
	p.Header.AppName = brand.Name
	return nil, false
}

// NewApp builds the goapplib App with templates from templatesDir. The folder's
// templar.yaml maps the @goapplib/ prefix to the vendored goapplib templates.
func NewApp(templatesDir string) (*goal.App[*App], error) {
	configPath, err := filepath.Abs(filepath.Join(templatesDir, "templar.yaml"))
	if err != nil {
		return nil, err
	}
	loader, err := tmplr.NewSourceLoaderFromConfig(configPath)
	if err != nil {
		return nil, err
	}
	templates := tmplr.NewTemplateGroup()
	templates.Loader = loader
	templates.AddFuncs(goal.DefaultFuncMap())
	templates.AddFuncs(template.FuncMap{
		"brand": func() string { return brand.Name },
	})
	return goal.NewApp(&App{}, templates), nil
}

// Register mounts the pages and the static-asset servers onto mux. /legacy/
// serves the 2016 Laya Gnana app as it was at the pre-sadhana-port tag
// (web/legacy, see its README.md).
func Register(app *goal.App[*App], mux *http.ServeMux, webDir string) {
	goal.Register[*HomePage](app, mux, "/{$}")
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(webDir, "static")))))
	mux.Handle("/legacy/", http.StripPrefix("/legacy/", http.FileServer(http.Dir(filepath.Join(webDir, "legacy")))))
}

// MissingAssets lists the built frontend files that are absent under webDir.
// They come from `make ui` and are gitignored, so a fresh clone has none.
func MissingAssets(webDir string) []string {
	var missing []string
	for _, f := range []string{"static/app.js", "static/css/tailwind.css"} {
		if _, err := os.Stat(filepath.Join(webDir, f)); err != nil {
			missing = append(missing, f)
		}
	}
	return missing
}
