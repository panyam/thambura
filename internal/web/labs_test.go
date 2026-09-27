package web

import (
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"
)

func getWithHeaders(t *testing.T, url string) (int, http.Header, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, string(body)
}

// Every labs page is an experiment on the live site: kept out of search,
// pointing search engines at the real page, and saying what it is.
func TestLabsPagesAreMarkedAsExperiments(t *testing.T) {
	srv := newServer(t)
	if len(labs) == 0 {
		t.Fatal("no labs pages")
	}
	for _, lab := range labs {
		code, h, body := getWithHeaders(t, srv.URL+"/labs/"+lab.Slug)
		if code != http.StatusOK {
			t.Fatalf("GET /labs/%s = %d\n%s", lab.Slug, code, body)
		}
		if got := h.Get("X-Robots-Tag"); got != "noindex" {
			t.Errorf("/labs/%s X-Robots-Tag = %q, want noindex", lab.Slug, got)
		}
		for _, want := range []string{
			`<link rel="canonical" href="https://thambura.com/">`,
			`data-labs-banner`,
			`href="/labs/"`,
			lab.Title,
		} {
			if !strings.Contains(body, want) {
				t.Errorf("/labs/%s missing %q", lab.Slug, want)
			}
		}
	}
}

// The side-by-side page puts the tala and the thambura in two slots, the
// thambura as a panel rather than a drawer, with no floating drawer controls.
func TestSideBySideSpec(t *testing.T) {
	srv := newServer(t)
	_, body := get(t, srv.URL+"/labs/side-by-side")
	s := pageSpec(t, body)
	var got []string
	for _, is := range s.Islands {
		got = append(got, is.Name+"@"+is.Slot+":"+is.Presentation)
	}
	if strings.Join(got, ",") != "tala@main:page,thambura@side:panel" || s.Layout != "side-by-side" {
		t.Fatalf("spec = %v in layout %q", got, s.Layout)
	}
	for _, slot := range s.Slots() {
		if n := strings.Count(body, `data-slot="`+slot+`"`); n != 1 {
			t.Errorf("slot %q appears %d times, want once", slot, n)
		}
	}
	for _, gone := range []string{`id="thambura-controls"`, `id="thambura-toggle"`, `data-slot="drawer"`} {
		if strings.Contains(body, gone) {
			t.Errorf("side-by-side page carries the drawer's %s", gone)
		}
	}
	// Same starting instruments as the home page.
	_, home := get(t, srv.URL+"/")
	if a, b := len(pageSpec(t, home).Instruments), len(s.Instruments); a != b {
		t.Errorf("side-by-side seeds %d instruments, home %d", b, a)
	}
}

// The tracks page puts the tala on top and the track list under it, with no
// drawer: the thambura is one of the tracks, and the claps' and kit's controls are theirs.
func TestTracksSpec(t *testing.T) {
	srv := newServer(t)
	_, body := get(t, srv.URL+"/labs/tracks")
	s := pageSpec(t, body)
	var got []string
	for _, is := range s.Islands {
		got = append(got, is.Name+"@"+is.Slot+":"+is.Presentation)
	}
	if strings.Join(got, ",") != "tala@main:page,tracks@tracks:page" || s.Layout != "tracks" {
		t.Fatalf("spec = %v in layout %q", got, s.Layout)
	}
	if v, ok := s.Islands[0].Config["instrumentControls"]; !ok || v != false {
		t.Errorf("tala config instrumentControls = %v, want false", v)
	}
	for _, slot := range s.Slots() {
		if n := strings.Count(body, `data-slot="`+slot+`"`); n != 1 {
			t.Errorf("slot %q appears %d times, want once", slot, n)
		}
	}
	for _, gone := range []string{`id="thambura-controls"`, `data-slot="drawer"`} {
		if strings.Contains(body, gone) {
			t.Errorf("tracks page carries the drawer's %s", gone)
		}
	}
}

// The index lists every labs page, and nothing else links into labs.
func TestLabsIndex(t *testing.T) {
	srv := newServer(t)
	code, h, body := getWithHeaders(t, srv.URL+"/labs/")
	if code != http.StatusOK {
		t.Fatalf("GET /labs/ = %d", code)
	}
	if h.Get("X-Robots-Tag") != "noindex" {
		t.Errorf("/labs/ isn't noindex")
	}
	links := regexp.MustCompile(`href="(/labs/[^"]+)"`).FindAllStringSubmatch(body, -1)
	seen := map[string]bool{}
	for _, m := range links {
		seen[m[1]] = true
	}
	for _, lab := range labs {
		if !seen["/labs/"+lab.Slug] {
			t.Errorf("/labs/ doesn't link to %s", lab.Slug)
		}
	}
	for link := range seen {
		if code, _ := get(t, srv.URL+link); code != http.StatusOK {
			t.Errorf("/labs/ links to %s, which is %d", link, code)
		}
	}
}

func TestLabsUnknownPageIs404(t *testing.T) {
	srv := newServer(t)
	if code, _ := get(t, srv.URL+"/labs/nope"); code != http.StatusNotFound {
		t.Fatalf("GET /labs/nope = %d, want 404", code)
	}
}

// Labs stay out of the sitemap, and the noindex on them doesn't leak onto
// the real pages.
func TestLabsStayOutOfSearch(t *testing.T) {
	srv := newServer(t)
	_, sitemap := get(t, srv.URL+"/sitemap.xml")
	if strings.Contains(sitemap, "/labs") {
		t.Errorf("sitemap lists a labs page:\n%s", sitemap)
	}
	_, h, _ := getWithHeaders(t, srv.URL+"/")
	if got := h.Get("X-Robots-Tag"); got != "" {
		t.Errorf("/ has X-Robots-Tag %q", got)
	}
}
