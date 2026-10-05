package web

import (
	"net/http"

	goal "github.com/panyam/goapplib"
	"github.com/panyam/goapplib/page"

	"github.com/panyam/thambura/internal/brand"
)

// EmbedDemoPage is a page written the way another site would write one to
// embed the tala and the thambura: none of our chrome (no BasePage, header,
// theme, app.js or tailwind.css), a spec script and a slot per island, and
// embed.js from /static (web/src/embed.ts). It shows hosts what to write and
// is how the browser checks exercise embedding. Kept out of search.
type EmbedDemoPage struct {
	// Preload is embed.js's chunks and its islands', for <link
	// rel="modulepreload">. A real host can't know them; the demo lists them
	// to show it can be done.
	Preload []string
	AppURL  string
}

// embedDemoSpec is the spec the demo's template writes for embed.js, as a
// host would (web/templates/embed/EmbedDemo.html), so Go knows which
// islands' chunks to preload. Keep the two in step.
var embedDemoSpec = page.Spec{Islands: []page.Island{{Name: "tala", Slot: "tala"}, {Name: "thambura", Slot: "thambura", Presentation: "panel"}}}

// Load implements the goapplib View.
func (p *EmbedDemoPage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	p.Preload = app.Context.Assets.For("embed", embedDemoSpec)
	p.AppURL = brand.URL + "/"
	return nil, false
}

func registerEmbed(app *goal.App[*App], mux *http.ServeMux) {
	em := http.NewServeMux()
	goal.Register[*EmbedDemoPage](app, em, "/embed/demo", goal.WithTemplate("embed/EmbedDemo"))
	mux.Handle("/embed/", noindex(em))
}
