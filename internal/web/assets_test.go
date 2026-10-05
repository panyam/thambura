package web

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/panyam/goapplib/page"
)

// The fixture is shaped like web/meta.json: app.js and embed.js, the four
// island chunks, the Lab's chunk (lazy, but not an island), and chunks they
// share.
func fixtureAssets(t *testing.T) *page.Assets {
	t.Helper()
	a := loadAssets(filepath.Join("testdata"))
	if a == nil {
		t.Fatal("the fixture didn't load")
	}
	return a
}

func TestLoadAssets(t *testing.T) {
	dir := t.TempDir()
	if got := loadAssets(dir); got != nil {
		t.Fatalf("no metafile: got %v, want nil", got)
	}
	if got := (*page.Assets)(nil).For("app", page.Spec{}); len(got) != 0 {
		t.Fatalf("nil assets preload %q, want nothing", got)
	}
	os.WriteFile(filepath.Join(dir, "meta.json"), []byte("not json"), 0o644)
	if got := loadAssets(dir); got != nil {
		t.Fatalf("a broken metafile: got %v, want nil", got)
	}
	// The islands are the registry's, and the Lab's chunk isn't one.
	if got := fixtureAssets(t).Names(); !slices.Equal(got, islandNames) {
		t.Fatalf("islands = %q, want %q", got, islandNames)
	}
}

// head returns everything before </head> in the page at url.
func head(t *testing.T, url string) string {
	t.Helper()
	_, body := get(t, url)
	return body[:strings.Index(body, "</head>")]
}

func preloads(h, chunk string) bool {
	return strings.Contains(h, `<link rel="modulepreload" href="/static/chunks/`+chunk+`">`)
}

// Each page preloads app.js's own chunks and those of its islands that mount
// at once, and nothing for an island it doesn't have or that waits.
func TestPagesPreloadTheirIslands(t *testing.T) {
	srv, app := newServerWithApp(t)
	app.Context.Assets = fixtureAssets(t)
	for _, tc := range []struct {
		path      string
		want, not []string
	}{
		// The tala and the track list; the docked thambura isn't on /.
		{"/", []string{"shared-A.js", "app-only-O.js", "tala-T.js", "view-V.js", "tracks-K.js", "panel-P.js"}, []string{"thambura-H.js", "session-S.js", "ThamburaLab-L.js", "embed-only-E.js"}},
		// The thambura waits until it's scrolled to, so it isn't preloaded.
		{"/labs/side-by-side", []string{"shared-A.js", "tala-T.js", "view-V.js"}, []string{"thambura-H.js", "panel-P.js", "tracks-K.js"}},
		{"/about", []string{"shared-A.js", "app-only-O.js"}, []string{"tala-T.js", "tracks-K.js"}},
		{"/labs/", []string{"shared-A.js"}, []string{"tala-T.js"}},
	} {
		h := head(t, srv.URL+tc.path)
		for _, c := range tc.want {
			if !preloads(h, c) {
				t.Errorf("%s doesn't preload %s", tc.path, c)
			}
		}
		for _, c := range tc.not {
			if preloads(h, c) {
				t.Errorf("%s preloads %s, which it doesn't need at once", tc.path, c)
			}
		}
	}
	app.Context.Assets = nil
	if h := head(t, srv.URL+"/"); strings.Contains(h, "modulepreload") {
		t.Errorf("/ preloads something with no metafile")
	}
}

func TestEmbedDemoPreloadsTheEmbedEntry(t *testing.T) {
	srv, app := newServerWithApp(t)
	app.Context.Assets = fixtureAssets(t)
	_, body := get(t, srv.URL+"/embed/demo")
	for _, c := range []string{"shared-A.js", "embed-only-E.js", "tala-T.js", "thambura-H.js", "panel-P.js"} {
		if !preloads(body, c) {
			t.Errorf("/embed/demo doesn't preload %s", c)
		}
	}
	if preloads(body, "app-only-O.js") {
		t.Errorf("/embed/demo preloads app.js's own chunk")
	}
}

// Every island a page names is one the browser's registry has
// (web/src/player/islands.ts), so a typo fails here rather than as a
// console warning on one page.
func TestSpecsNameKnownIslands(t *testing.T) {
	specs := []page.Spec{homeSpec(nil).Spec, sideBySideSpec(nil).Spec, embedDemoSpec}
	if err := page.CheckIslands(islandNames, specs...); err != nil {
		t.Fatal(err)
	}
	bad := page.Spec{Layout: "x", Islands: []page.Island{{Name: "drone", Slot: "a"}}}
	if page.CheckIslands(islandNames, bad) == nil {
		t.Fatal("an unknown island passed the check")
	}
}
