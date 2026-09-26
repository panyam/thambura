// Package page describes which islands a page mounts and where, as a Spec
// the server renders into the page for the browser to read. It knows nothing
// about Thambura, so it can move into goapplib later (panyam/goapplib#28).
//
// A layout template places the slots (elements with data-slot); the Spec
// says which island goes in each, how it's presented, and its config. The
// browser side is web/src/page/.
package page

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"regexp"
)

// Spec is what a page starts with: a layout, the islands it mounts (views,
// in mount order) and the instruments it seeds. Islands and instruments are
// kept apart because they come and go differently: the islands are fixed by
// the page, while instruments are added and removed in the browser once it
// runs. The spec only says which ones a page opens with.
type Spec struct {
	// Layout names the arrangement of slots, for code that keeps state per
	// layout. The template that draws it is chosen by the page, not by this.
	Layout      string       `json:"layout"`
	Islands     []Island     `json:"islands"`
	Instruments []Instrument `json:"instruments"`
}

// Instrument is one instrument the page starts with. Kind picks what the
// browser builds; Config is handed to it as is, so it must be JSON.
type Instrument struct {
	Kind   string         `json:"kind"`
	Config map[string]any `json:"config"`
}

// Island is one island on the page. Name picks the factory from the
// browser's registry; Slot is the data-slot of the element it mounts in.
// Presentation says how the layout shows it ("page", "panel", "drawer",
// "strip"), for islands that draw differently in each. Config is handed to
// the factory as is, so it must be JSON.
type Island struct {
	Name         string         `json:"name"`
	Slot         string         `json:"slot"`
	Presentation string         `json:"presentation,omitempty"`
	Config       map[string]any `json:"config"`
}

// Slot names are used in a CSS attribute selector, so keep them plain.
var slotName = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)

// Validate reports a spec the browser couldn't mount as meant: no layout, an
// island without a name or with a bad slot name, or two islands in one slot.
func (s Spec) Validate() error {
	if s.Layout == "" {
		return fmt.Errorf("page spec has no layout")
	}
	for i, in := range s.Instruments {
		if in.Kind == "" {
			return fmt.Errorf("instrument %d has no kind", i)
		}
	}
	seen := map[string]string{}
	for i, is := range s.Islands {
		if is.Name == "" {
			return fmt.Errorf("island %d has no name", i)
		}
		if !slotName.MatchString(is.Slot) {
			return fmt.Errorf("island %q has slot %q; want lowercase letters, digits and dashes", is.Name, is.Slot)
		}
		if other, ok := seen[is.Slot]; ok {
			return fmt.Errorf("islands %q and %q share slot %q", other, is.Name, is.Slot)
		}
		seen[is.Slot] = is.Name
	}
	return nil
}

// Slots lists the slots the spec fills, in mount order.
func (s Spec) Slots() []string {
	out := make([]string, len(s.Islands))
	for i, is := range s.Islands {
		out[i] = is.Slot
	}
	return out
}

// JSON is the spec for a <script type="application/json"> element. Every
// '<' is escaped, so no config value can close the script or open a comment;
// a nil Config is written as {} and nil lists as [], so the browser always
// gets an object or a list.
func (s Spec) JSON() template.JS {
	c := s
	c.Islands = make([]Island, len(s.Islands))
	for i, is := range s.Islands {
		if is.Config == nil {
			is.Config = map[string]any{}
		}
		c.Islands[i] = is
	}
	c.Instruments = make([]Instrument, len(s.Instruments))
	for i, in := range s.Instruments {
		if in.Config == nil {
			in.Config = map[string]any{}
		}
		c.Instruments[i] = in
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf) // escapes <, > and & as \u003c and so on
	if err := enc.Encode(c); err != nil {
		return template.JS("null")
	}
	return template.JS(bytes.TrimSpace(buf.Bytes()))
}
