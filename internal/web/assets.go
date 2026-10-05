package web

import (
	"errors"
	"io/fs"
	"log"
	"path"
	"path/filepath"
	"strings"

	"github.com/panyam/goapplib/page"
)

// islandNames are the islands the browser's registry can mount
// (web/src/player/islands.ts), each a lazy chunk from web/src/islands/.
// TestSpecsNameKnownIslands checks every page's spec against them, and
// `pnpm buildcheck` checks the build has a chunk for each.
var islandNames = []string{"session", "tala", "thambura", "tracks"}

// loadAssets reads web/meta.json, esbuild's metafile from web/build.mjs,
// into what the pages preload: each entry's chunks (app.js and embed.js)
// and each island's (page.Assets.For). It's a build product, so a checkout
// that hasn't built the frontend has none, and a missing or unreadable one
// is logged and gives nil, whose For preloads nothing; the pages work
// without it, a little slower.
func loadAssets(webDir string) *page.Assets {
	file := filepath.Join(webDir, "meta.json")
	a, err := page.LoadEsbuildMetafile(file, page.EsbuildOptions{OutDir: "static", URLPrefix: "/static/", Name: assetName})
	if errors.Is(err, fs.ErrNotExist) {
		log.Printf("no %s (the frontend isn't built); pages will preload nothing", file)
		return nil
	}
	if err != nil {
		log.Printf("reading %s: %v; pages will preload nothing", file, err)
		return nil
	}
	return a
}

// assetName names a build output by its source: the two entries after the
// scripts they build (app.js, embed.js), each island after its module in
// src/islands/, and nothing else. The Lab and Raagini views are lazy too, but
// they load when a listener opens them, not with a page, so they're left out.
func assetName(source string) string {
	switch source {
	case "src/main.ts":
		return "app"
	case "src/embed.ts":
		return "embed"
	}
	if strings.HasPrefix(source, "src/islands/") {
		base := path.Base(source)
		return strings.TrimSuffix(base, path.Ext(base))
	}
	return ""
}
