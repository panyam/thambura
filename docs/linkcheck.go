package main

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// Built by esbuild from components/ (make docs), not by s3gen, so a build
// without it still has to pass.
const genPrefix = PathPrefix + "/static/js/gen/"

var (
	linkAttr = regexp.MustCompile(`(?:href|src)="([^"]*)"`)
	idAttr   = regexp.MustCompile(`\sid="([^"]*)"`)
)

// CheckLinks reads every page under outDir, a site built for PathPrefix, and
// returns one line per link that goes nowhere: a page or file that isn't
// there, a #fragment with no matching id, or a folder without its trailing
// slash. External links (anything with a scheme, the app's included) aren't
// fetched.
func CheckLinks(outDir string) ([]string, error) {
	pages := map[string]string{} // URL path of each page -> its HTML
	err := filepath.WalkDir(outDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(p) != ".html" {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(outDir, p)
		pages[PathPrefix+"/"+filepath.ToSlash(rel)] = string(b)
		return nil
	})
	if err != nil {
		return nil, err
	}
	ids := map[string]map[string]bool{}
	idsOf := func(page string) map[string]bool {
		if ids[page] == nil {
			ids[page] = map[string]bool{}
			for _, m := range idAttr.FindAllStringSubmatch(pages[page], -1) {
				ids[page][m[1]] = true
			}
		}
		return ids[page]
	}

	var broken []string
	for page, html := range pages {
		for _, m := range linkAttr.FindAllStringSubmatch(html, -1) {
			if msg := checkLink(outDir, page, m[1], pages, idsOf); msg != "" {
				broken = append(broken, fmt.Sprintf("%s: %q %s", page, m[1], msg))
			}
		}
	}
	return broken, nil
}

func checkLink(outDir, page, link string, pages map[string]string, idsOf func(string) map[string]bool) string {
	if link == "" {
		return "is empty"
	}
	if strings.Contains(link, ":") && !strings.HasPrefix(link, "/") && !strings.HasPrefix(link, "#") {
		return "" // http:, https:, mailto: and the like
	}
	target, frag, _ := strings.Cut(link, "#")
	target, _, _ = strings.Cut(target, "?")
	switch {
	case target == "":
		target = page
	case !strings.HasPrefix(target, "/"):
		dir := strings.HasSuffix(target, "/")
		target = path.Join(path.Dir(page), target)
		if dir && !strings.HasSuffix(target, "/") {
			target += "/"
		}
	}
	if target != PathPrefix && !strings.HasPrefix(target, PathPrefix+"/") {
		return "is outside " + PathPrefix + "/"
	}
	if strings.HasPrefix(target, genPrefix) {
		return ""
	}
	if target == PathPrefix || strings.HasSuffix(target, "/") {
		target = strings.TrimSuffix(target, "/") + "/index.html"
	}
	if _, ok := pages[target]; !ok {
		file := filepath.Join(outDir, filepath.FromSlash(strings.TrimPrefix(target, PathPrefix+"/")))
		st, err := os.Stat(file)
		if err != nil {
			return "goes to nothing"
		}
		if st.IsDir() {
			return "is a folder: end the link with /"
		}
		if frag != "" {
			return "has a fragment on a file that isn't a page"
		}
		return ""
	}
	if frag != "" && !idsOf(target)[frag] {
		return "names an id the page doesn't have"
	}
	return ""
}
