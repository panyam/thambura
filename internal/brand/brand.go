// Package brand holds the product's display name. The drone feature inside
// the app is also called the thambura.
package brand

// Name is shown in page titles and the header.
const Name = "Thambura"

// URL is the site's canonical origin. Canonical links, social previews and
// the sitemap use it, so copies served from www or appspot count as this one.
const URL = "https://thambura.com"

// ProjectID is the App Engine project the real site runs on. A deploy to any
// other project (`make deploydev`) is a test copy, and the server keeps it out
// of search.
const ProjectID = "thambura"
