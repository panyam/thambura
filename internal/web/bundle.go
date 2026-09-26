package web

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// Bundle is what the frontend build says about its entries, from
// web/bundle.json (written by web/build.mjs). The file is a build product,
// so a checkout that hasn't built the frontend has none, and the pages then
// preload nothing, which only costs a little speed.
type Bundle struct {
	// App runs our pages; Embed runs the same islands on other sites.
	App   BundleEntry `json:"app"`
	Embed BundleEntry `json:"embed"`
}

// BundleEntry is one entry script and the chunks it imports before it can
// run. The pages list those chunks as <link rel="modulepreload"> so the
// browser fetches them alongside the entry instead of one after another.
type BundleEntry struct {
	Script  string   `json:"script"`
	Preload []string `json:"preload"`
}

// Chunks are the only thing a page should preload; anything else in the
// manifest is dropped rather than written into every page's head.
const chunkPrefix = "/static/chunks/"

// loadBundle reads webDir/bundle.json. A missing or unreadable manifest is
// an empty Bundle: logged, since a deploy should always have one, but not
// fatal, since the pages work without it.
func loadBundle(webDir string) Bundle {
	path := filepath.Join(webDir, "bundle.json")
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		log.Printf("no %s (the frontend isn't built); pages will preload nothing", path)
		return Bundle{}
	}
	var b Bundle
	if err == nil {
		err = json.Unmarshal(data, &b)
	}
	if err != nil {
		log.Printf("reading %s: %v; pages will preload nothing", path, err)
		return Bundle{}
	}
	b.App.Preload = onlyChunks(b.App.Preload)
	b.Embed.Preload = onlyChunks(b.Embed.Preload)
	return b
}

func onlyChunks(urls []string) []string {
	var kept []string
	for _, p := range urls {
		if strings.HasPrefix(p, chunkPrefix) && !strings.Contains(p, "..") {
			kept = append(kept, p)
		}
	}
	return kept
}
