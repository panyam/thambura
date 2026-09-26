// Package web serves Thambura's pages: goapplib page shells rendered through
// templar, each hosting a Solid island. The pages own no data; everything the
// player needs (sounds, images, tala fixtures) is fetched from /static by the
// browser. /legacy/ serves the original 2016 app, untouched but for its paths.
package web

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	goal "github.com/panyam/goapplib"
	tmplr "github.com/panyam/templar"

	"github.com/panyam/thambura/internal/brand"
	"github.com/panyam/thambura/internal/page"
)

// App is the goapplib app context, which every page's Load is handed.
type App struct {
	// KitURLs are the instrument kits found under static at startup, in name
	// order, or none. Register fills them in, since it knows where static is.
	KitURLs []string
}

// Header is the data goapplib's Header template renders with.
type Header struct {
	AppName string
}

// SitePage is what every page's shell renders: goapplib's page fields (title,
// description, canonical URL), our header, and the link-preview and search
// metadata that BasePage.html writes into <head>.
type SitePage struct {
	goal.BasePage
	Header Header
	// Social is the Open Graph / Twitter preview. Its Image must be an
	// absolute URL; preview bots don't resolve relative ones.
	Social Social
	// StructuredData is JSON-LD for search engines, or empty for none.
	StructuredData template.JS
}

// Social describes a page's link preview on chat apps and social sites.
type Social struct {
	// Description replaces MetaDescription in the preview, which shows about
	// 125 characters where search results show about 160. Empty uses it as is.
	Description string
	Image       string
	ImageAlt    string
	ImageWidth  int
	ImageHeight int
}

// HomePage is the practice page: the tala in the main slot and the thambura
// in a drawer, laid out by layouts/Drawer.html and mounted from Spec.
type HomePage struct {
	SitePage
	// Spec says which islands the page mounts, and each one's config; the
	// browser reads it from the page (web/src/page/).
	Spec page.Spec
}

// fixturesURL is the fixture with the tala's image groups and the hand claps'
// sound groups.
const fixturesURL = "/static/Resources/TalasFixtures.json"

// homeSpec is the home page's islands and the instruments it starts with:
// the hand claps, and a kit for each kit found. Which instruments are playing after that is the
// browser's business. Kits are build products copied in (make devkit) and
// aren't committed, so most checkouts have none, and then the spec seeds
// none rather than sending the browser after a kit.json that isn't there.
func homeSpec(kitURLs []string) page.Spec {
	return page.Spec{
		Layout:      "drawer",
		Islands:     []page.Island{talaIsland("main"), {Name: "thambura", Slot: "drawer", Presentation: "drawer"}},
		Instruments: startingInstruments(kitURLs),
	}
}

// talaIsland is the tala filling a page-sized slot.
func talaIsland(slot string) page.Island {
	return page.Island{Name: "tala", Slot: slot, Presentation: "page", Config: map[string]any{"fixturesUrl": fixturesURL}}
}

// startingInstruments seeds the hand claps, which play the tala's calls from
// the fixture's sound groups, and a kit instrument for each kit found. It's
// the same on every page with a tala, since which instruments are playing
// isn't a layout's business.
func startingInstruments(kitURLs []string) []page.Instrument {
	instruments := []page.Instrument{{Kind: "hands", Config: map[string]any{"fixturesUrl": fixturesURL}}}
	for _, u := range kitURLs {
		instruments = append(instruments, page.Instrument{Kind: "kit", Config: map[string]any{"url": u}})
	}
	return instruments
}

// findKits returns the URL of every kit manifest under static/Resources/Kits,
// in name order, or none.
func findKits(static string) []string {
	matches, err := filepath.Glob(filepath.Join(static, "Resources", "Kits", "*", "kit.json"))
	if err != nil {
		return nil
	}
	var urls []string
	for _, m := range matches {
		urls = append(urls, "/static/Resources/Kits/"+filepath.Base(filepath.Dir(m))+"/kit.json")
	}
	return urls
}

// The home page's search and preview text, near the lengths results show in
// full. It says thambura, as South India does, and the description adds
// tanpura, the North Indian name many people search with. The title says
// shruthi box, the name students grew up with for the drone.
const (
	homeTitle       = brand.Name + ": online shruthi box and Carnatic tala keeper"
	homeDescription = "A free online thambura (tanpura) drone in any shruthi, and a Carnatic tala keeper for " +
		"sapta and chaapu talas with finger-count hand images. Runs in the browser."
	homeSocialDescription = "A free online thambura (tanpura) drone in any shruthi, and a Carnatic tala keeper. " +
		"Runs in your browser."
)

// Load implements the goapplib View.
func (p *HomePage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	p.Title = brand.Name
	p.MetaTitle = homeTitle
	p.MetaDescription = homeDescription
	p.CanonicalUrl = brand.URL + "/"
	p.DisableSplashScreen = true
	p.Header.AppName = brand.Name
	p.Social = Social{
		Description: homeSocialDescription,
		Image:       brand.URL + "/static/og.png",
		ImageAlt:    "Thambura: a hand keeping tala beside the words online shruthi box and Carnatic tala keeper",
		ImageWidth:  1200,
		ImageHeight: 630,
	}
	p.StructuredData = webApplicationLD()
	p.Spec = homeSpec(app.Context.KitURLs)
	if err := p.Spec.Validate(); err != nil {
		return err, false
	}
	return nil, false
}

// webApplicationLD describes the site to search engines as a free web app.
func webApplicationLD() template.JS {
	ld, err := json.Marshal(map[string]any{
		"@context":               "https://schema.org",
		"@type":                  "WebApplication",
		"name":                   brand.Name,
		"url":                    brand.URL + "/",
		"description":            homeDescription,
		"applicationCategory":    "MultimediaApplication",
		"applicationSubCategory": "Music practice",
		"operatingSystem":        "Any (runs in a web browser)",
		"browserRequirements":    "Requires JavaScript and Web Audio",
		"inLanguage":             "en",
		"isAccessibleForFree":    true,
		"offers":                 map[string]any{"@type": "Offer", "price": "0", "priceCurrency": "USD"},
		"image":                  brand.URL + "/static/og.png",
	})
	if err != nil {
		return ""
	}
	return template.JS(ld)
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
// (web/legacy, see its README.md), marked noindex so it doesn't compete with
// the app in search. On App Engine, app.yaml serves /static and /legacy
// itself (and sends the same header); everything else comes here, wrapped in
// SiteHandler.
func Register(app *goal.App[*App], mux *http.ServeMux, webDir string) {
	static := filepath.Join(webDir, "static")
	app.Context.KitURLs = findKits(static)
	goal.Register[*HomePage](app, mux, "/{$}")
	registerLabs(app, mux)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(static))))
	mux.Handle("/legacy/", noindex(http.StripPrefix("/legacy/", http.FileServer(http.Dir(filepath.Join(webDir, "legacy"))))))
	// The service worker has to come from the root to cover the whole site,
	// and browsers revalidate it on every update check, so it isn't cached.
	mux.HandleFunc("GET /sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(static, "sw.js"))
	})
	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(static, "favicon.ico"))
	})
	mux.HandleFunc("GET /robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if Staging() {
			fmt.Fprint(w, "User-agent: *\nDisallow: /\n")
			return
		}
		fmt.Fprintf(w, "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n", brand.URL)
	})
	mux.HandleFunc("GET /sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>%s/</loc></url>
</urlset>
`, brand.URL)
	})
}

// Staging reports whether this process is a test copy of the site rather than
// the real one. `make deploydev` deploys a brand.DevVersionPrefix version,
// which App Engine reports in GAE_VERSION, by default into the real project;
// DEV_PROJECT sends it to another project instead, which GOOGLE_CLOUD_PROJECT
// reports. Both variables are unset on a server run locally, which is not
// staging.
func Staging() bool {
	if p := os.Getenv("GOOGLE_CLOUD_PROJECT"); p != "" && p != brand.ProjectID {
		return true
	}
	return strings.HasPrefix(os.Getenv("GAE_VERSION"), brand.DevVersionPrefix)
}

// SiteHandler wraps the mux with what a whole deploy needs. On a staging
// project every response is marked noindex, so a test copy can't turn up in
// search beside the real site; on production h is returned as it is.
func SiteHandler(h http.Handler) http.Handler {
	if !Staging() {
		return h
	}
	return noindex(h)
}

// noindex asks search engines to leave a response out of their index.
func noindex(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Robots-Tag", "noindex")
		h.ServeHTTP(w, r)
	})
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
