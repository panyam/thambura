package web

import (
	"net/http"

	goal "github.com/panyam/goapplib"

	"github.com/panyam/thambura/internal/brand"
	"github.com/panyam/thambura/internal/page"
)

// Lab is one experiment with how the page is laid out, served on the live
// site under /labs/<Slug> (docs/designs/layouts.md, "Trying layouts"). Labs
// are kept out of search (noindex, not in the sitemap, canonical link to /)
// and say they're an experiment. They share the instruments and their
// settings with /; only what the layout itself keeps is theirs.
type Lab struct {
	Slug  string
	Title string
	// Blurb says what the experiment tries, for the /labs/ index.
	Blurb string
}

// labs is every labs page, in the order the index lists them. The routes and
// the index both come from here, so a page can't be served but unlisted.
var labs = []Lab{
	{
		Slug:  "side-by-side",
		Title: "Side by side",
		Blurb: "The tala and the thambura next to each other on a wide screen, and one under the other on a phone, rather than the thambura in a drawer.",
	},
	{
		Slug:  "tracks",
		Title: "Tracks",
		Blurb: "Every instrument on the page as a card you can add, remove, mute and solo: one column on a phone, a grid on a wide screen.",
	},
}

func labBySlug(slug string) Lab {
	for _, l := range labs {
		if l.Slug == slug {
			return l
		}
	}
	panic("no lab " + slug)
}

// registerLabs mounts /labs/ and every labs page on their own mux, so the
// noindex header covers all of them and nothing else.
func registerLabs(app *goal.App[*App], mux *http.ServeMux) {
	lm := http.NewServeMux()
	goal.Register[*LabsIndexPage](app, lm, "/labs/{$}", goal.WithTemplate("labs/LabsIndex"))
	goal.Register[*SideBySidePage](app, lm, "/labs/side-by-side", goal.WithTemplate("labs/SideBySide"))
	goal.Register[*TracksPage](app, lm, "/labs/tracks", goal.WithTemplate("labs/Tracks"))
	mux.Handle("/labs/", noindex(lm))
}

// labPage fills in what every labs page shares: its titles, a canonical link
// to the real page (so search engines credit /, not the experiment) and the
// header.
func labPage(p *SitePage, app *goal.App[*App], title, description string) {
	p.Title = title + " · " + brand.Name + " labs"
	p.MetaTitle = p.Title
	p.MetaDescription = description
	p.CanonicalUrl = brand.URL + "/"
	p.DisableSplashScreen = true
	p.Header.AppName = brand.Name
	p.Preload = app.Context.Bundle.App.Preload
}

// LabsIndexPage lists the experiments.
type LabsIndexPage struct {
	SitePage
	Labs []Lab
	// Spec mounts no islands; the page only needs the header's scripts.
	Spec page.Spec
}

// Load implements the goapplib View.
func (p *LabsIndexPage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	labPage(&p.SitePage, app, "Experiments", "Experiments with how "+brand.Name+" is laid out.")
	p.Labs = labs
	p.Spec = page.Spec{Layout: "index"}
	return nil, false
}

// SideBySidePage is the tala and the thambura in two columns, the thambura
// docked as a panel rather than in a drawer (layouts.md option B).
type SideBySidePage struct {
	SitePage
	Lab  Lab
	Spec page.Spec
}

// Load implements the goapplib View.
func (p *SideBySidePage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	p.Lab = labBySlug("side-by-side")
	labPage(&p.SitePage, app, p.Lab.Title, p.Lab.Blurb)
	p.Spec = page.Spec{
		Layout:      "side-by-side",
		Islands:     []page.Island{talaIsland("main"), {Name: "thambura", Slot: "side", Presentation: "panel"}},
		Instruments: startingInstruments(app.Context.KitURLs),
	}
	if err := p.Spec.Validate(); err != nil {
		return err, false
	}
	return nil, false
}

// TracksPage is the track list (#101): the tala on top, then a card per
// instrument, which the track list adds and removes in the browser. The
// claps' and the kit's controls move into their cards, so the tala doesn't
// show them.
type TracksPage struct {
	SitePage
	Lab  Lab
	Spec page.Spec
}

// Load implements the goapplib View.
func (p *TracksPage) Load(r *http.Request, w http.ResponseWriter, app *goal.App[*App]) (error, bool) {
	p.Lab = labBySlug("tracks")
	labPage(&p.SitePage, app, p.Lab.Title, p.Lab.Blurb)
	tala := talaIsland("main")
	tala.Config["instrumentControls"] = false
	p.Spec = page.Spec{
		Layout:      "tracks",
		Islands:     []page.Island{tala, {Name: "tracks", Slot: "tracks", Presentation: "page"}},
		Instruments: startingInstruments(app.Context.KitURLs),
	}
	if err := p.Spec.Validate(); err != nil {
		return err, false
	}
	return nil, false
}
