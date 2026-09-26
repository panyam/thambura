package page

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestJSONIsSafeInsideAScriptTag(t *testing.T) {
	s := Spec{Layout: "drawer", Islands: []Island{
		{Name: "tala", Slot: "main", Config: map[string]any{"note": "</script><script>alert(1)</script> <!-- x"}},
	}}
	out := string(s.JSON())
	for _, bad := range []string{"</script", "<!--"} {
		if strings.Contains(strings.ToLower(out), bad) {
			t.Fatalf("JSON() contains %q: %s", bad, out)
		}
	}
	var back Spec
	if err := json.Unmarshal([]byte(out), &back); err != nil {
		t.Fatalf("JSON() doesn't parse back: %v\n%s", err, out)
	}
	if back.Islands[0].Config["note"] != s.Islands[0].Config["note"] {
		t.Fatalf("config changed on the way through: %q", back.Islands[0].Config["note"])
	}
}

func TestJSONShape(t *testing.T) {
	s := Spec{Layout: "drawer", Islands: []Island{{Name: "thambura", Slot: "drawer", Presentation: "drawer"}}}
	var got map[string]any
	if err := json.Unmarshal([]byte(s.JSON()), &got); err != nil {
		t.Fatal(err)
	}
	island := got["islands"].([]any)[0].(map[string]any)
	want := map[string]any{"name": "thambura", "slot": "drawer", "presentation": "drawer", "config": map[string]any{}}
	for k, v := range want {
		if k == "config" {
			if c, ok := island[k].(map[string]any); !ok || len(c) != 0 {
				t.Fatalf("config = %#v, want {}", island[k])
			}
			continue
		}
		if island[k] != v {
			t.Fatalf("%s = %#v, want %#v", k, island[k], v)
		}
	}
	if got["layout"] != "drawer" {
		t.Fatalf("layout = %#v", got["layout"])
	}
}

func TestValidate(t *testing.T) {
	ok := Spec{Layout: "drawer", Islands: []Island{{Name: "tala", Slot: "main"}, {Name: "thambura", Slot: "drawer"}}}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid spec: %v", err)
	}
	for name, s := range map[string]Spec{
		"no layout":   {Islands: []Island{{Name: "tala", Slot: "main"}}},
		"no name":     {Layout: "drawer", Islands: []Island{{Slot: "main"}}},
		"no slot":     {Layout: "drawer", Islands: []Island{{Name: "tala"}}},
		"shared slot": {Layout: "drawer", Islands: []Island{{Name: "tala", Slot: "main"}, {Name: "thambura", Slot: "main"}}},
		"bad slot":    {Layout: "drawer", Islands: []Island{{Name: "tala", Slot: `main"]`}}},
	} {
		if err := s.Validate(); err == nil {
			t.Errorf("%s: Validate() = nil, want an error", name)
		}
	}
}

func TestInstruments(t *testing.T) {
	s := Spec{Layout: "drawer", Instruments: []Instrument{{Kind: "kit", Config: map[string]any{"url": "/k/kit.json"}}, {Kind: "kit"}}}
	if err := s.Validate(); err != nil {
		t.Fatalf("valid spec: %v", err)
	}
	var got struct {
		Instruments []map[string]any `json:"instruments"`
	}
	if err := json.Unmarshal([]byte(s.JSON()), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Instruments) != 2 || got.Instruments[0]["kind"] != "kit" || got.Instruments[0]["config"].(map[string]any)["url"] != "/k/kit.json" {
		t.Fatalf("instruments = %#v", got.Instruments)
	}
	if c, ok := got.Instruments[1]["config"].(map[string]any); !ok || len(c) != 0 {
		t.Fatalf("a nil instrument config = %#v, want {}", got.Instruments[1]["config"])
	}
	// No instruments is an empty list, not null, so the browser can always loop.
	if out := string(Spec{Layout: "drawer"}.JSON()); !strings.Contains(out, `"instruments":[]`) {
		t.Fatalf("JSON() = %s, want an empty instruments list", out)
	}
	if err := (Spec{Layout: "drawer", Instruments: []Instrument{{}}}).Validate(); err == nil {
		t.Fatal("an instrument without a kind validated")
	}
}

func TestSlots(t *testing.T) {
	s := Spec{Layout: "drawer", Islands: []Island{{Name: "tala", Slot: "main"}, {Name: "thambura", Slot: "drawer"}}}
	if got := strings.Join(s.Slots(), ","); got != "main,drawer" {
		t.Fatalf("Slots() = %s", got)
	}
}
