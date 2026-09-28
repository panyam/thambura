package web

import (
	"fmt"
	"html/template"

	"github.com/panyam/goapplib/page"
)

// Spec is a Thambura page's spec: goapplib's page.Spec (the layout and the
// islands it mounts) plus the instruments the page can have. Islands and
// instruments are kept apart because they come and go differently: the
// islands are fixed by the page, while instruments are added and removed in
// the browser once it runs. encoding/json flattens the embedded spec, so the
// browser reads one object: layout, islands, instruments (web/src/page/).
type Spec struct {
	page.Spec
	Instruments []Instrument `json:"instruments"`
}

// Instrument is one instrument the page offers or starts with. Kind picks
// what the browser builds; Config is handed to it as is, so it must be JSON.
type Instrument struct {
	Kind   string         `json:"kind"`
	Config map[string]any `json:"config"`
}

// Validate is page.Spec's checks (a layout, named islands in plain, unshared
// slots) plus a kind for every instrument.
func (s Spec) Validate() error {
	if err := s.Spec.Validate(); err != nil {
		return err
	}
	for i, in := range s.Instruments {
		if in.Kind == "" {
			return fmt.Errorf("instrument %d has no kind", i)
		}
	}
	return nil
}

// JSON is the spec for goapplib's PageSpecScript partial: the islands and
// instruments with nil configs and lists as {} and [], escaped for a script
// element by page.ScriptJSON.
func (s Spec) JSON() template.JS {
	c := s
	c.Spec = s.Spec.Normalized()
	c.Instruments = make([]Instrument, len(s.Instruments))
	for i, in := range s.Instruments {
		if in.Config == nil {
			in.Config = map[string]any{}
		}
		c.Instruments[i] = in
	}
	return page.ScriptJSON(c)
}
