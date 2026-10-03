package web

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/panyam/goapplib/page"
)

// The browser reads one flat object (web/src/player/spec.ts): layout, islands
// and instruments side by side, whatever Go embeds.
func TestSpecJSONIsOneObject(t *testing.T) {
	s := Spec{
		Spec:        page.Spec{Layout: "tracks", Islands: []page.Island{{Name: "tala", Slot: "main"}}},
		Instruments: []Instrument{{Kind: "kit", Config: map[string]any{"url": "/k/kit.json"}}, {Kind: "kit"}},
	}
	var got struct {
		Layout      string           `json:"layout"`
		Islands     []map[string]any `json:"islands"`
		Instruments []map[string]any `json:"instruments"`
	}
	if err := json.Unmarshal([]byte(s.JSON()), &got); err != nil {
		t.Fatal(err)
	}
	if got.Layout != "tracks" || len(got.Islands) != 1 || got.Islands[0]["name"] != "tala" {
		t.Fatalf("spec = %+v", got)
	}
	if len(got.Instruments) != 2 || got.Instruments[0]["kind"] != "kit" || got.Instruments[0]["config"].(map[string]any)["url"] != "/k/kit.json" {
		t.Fatalf("instruments = %#v", got.Instruments)
	}
	if c, ok := got.Instruments[1]["config"].(map[string]any); !ok || len(c) != 0 {
		t.Fatalf("a nil instrument config = %#v, want {}", got.Instruments[1]["config"])
	}
	if c, ok := got.Islands[0]["config"].(map[string]any); !ok || len(c) != 0 {
		t.Fatalf("a nil island config = %#v, want {}", got.Islands[0]["config"])
	}
	// No instruments is an empty list, not null, so the browser can always loop.
	if out := string(Spec{Spec: page.Spec{Layout: "about"}}.JSON()); !strings.Contains(out, `"instruments":[]`) || !strings.Contains(out, `"islands":[]`) {
		t.Fatalf("JSON() = %s, want empty islands and instruments lists", out)
	}
}

func TestSpecValidate(t *testing.T) {
	ok := Spec{Spec: page.Spec{Layout: "tracks"}, Instruments: []Instrument{{Kind: "kit"}}}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid spec: %v", err)
	}
	if err := (Spec{Spec: page.Spec{Layout: "tracks"}, Instruments: []Instrument{{}}}).Validate(); err == nil {
		t.Fatal("an instrument without a kind validated")
	}
	// page.Spec's own checks still run.
	if err := (Spec{Spec: page.Spec{}}).Validate(); err == nil {
		t.Fatal("a spec without a layout validated")
	}
}

// A spec marks the instruments that are on the page from the start (#157);
// the flag is written only when set, so an instrument that's only offered
// looks as it always has.
func TestInstrumentAddedIsWrittenOnlyWhenSet(t *testing.T) {
	s := Spec{Spec: page.Spec{Layout: "tracks"}, Instruments: []Instrument{{Kind: "thambura", Added: true}, {Kind: "kit"}}}
	out := string(s.JSON())
	if !strings.Contains(out, `{"kind":"thambura","config":{},"added":true}`) || !strings.Contains(out, `{"kind":"kit","config":{}}`) {
		t.Fatalf("JSON() = %s", out)
	}
}

// The home page starts a new listener with the claps (always there) and a
// thambura, and only offers its kits.
func TestHomeSpecAddsTheThamburaOnly(t *testing.T) {
	var added []string
	for _, in := range homeSpec([]string{"/static/Resources/Kits/compmusic/kit.json"}).Instruments {
		if in.Added {
			added = append(added, in.Kind)
		}
	}
	if strings.Join(added, ",") != "thambura" {
		t.Fatalf("added = %v, want only the thambura", added)
	}
}
