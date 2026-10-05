package web

import (
	"net/http"
	"strings"
	"testing"
)

// The demo is a host's page, written the way another site would write it:
// none of our chrome, no app.js, and embed.js loading the islands into
// data-thambura-slot elements from a data-thambura-spec script.
func TestEmbedDemo(t *testing.T) {
	srv := newServer(t)
	code, h, body := getWithHeaders(t, srv.URL+"/embed/demo")
	if code != http.StatusOK {
		t.Fatalf("GET /embed/demo = %d\n%s", code, body)
	}
	if h.Get("X-Robots-Tag") != "noindex" {
		t.Errorf("/embed/demo isn't noindex")
	}
	for _, want := range []string{
		`<script type="module" src="/static/embed.js">`,
		`data-thambura-spec`,
		`data-thambura-slot="tala"`,
		`data-thambura-slot="thambura"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("/embed/demo missing %q", want)
		}
	}
	for _, chrome := range []string{"/static/app.js", "/static/css/tailwind.css", "theme-toggle-button", "install-app", "/static/manifest.json"} {
		if strings.Contains(body, chrome) {
			t.Errorf("/embed/demo carries our page chrome: %q", chrome)
		}
	}
}

// Other sites load embed.js, its chunks, the stylesheet, the fixtures and
// the sounds from us, and a module script or fetch() from another origin
// needs this header.
func TestStaticAllowsCrossOriginReads(t *testing.T) {
	srv := newServer(t)
	for _, path := range []string{"/static/Resources/TalasFixtures.json", "/static/favicon.svg"} {
		code, h, _ := getWithHeaders(t, srv.URL+path)
		if code != http.StatusOK {
			t.Fatalf("GET %s = %d", path, code)
		}
		if got := h.Get("Access-Control-Allow-Origin"); got != "*" {
			t.Errorf("%s Access-Control-Allow-Origin = %q, want *", path, got)
		}
	}
	if _, h, _ := getWithHeaders(t, srv.URL+"/"); h.Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("/ allows cross-origin reads; only /static should")
	}
}
