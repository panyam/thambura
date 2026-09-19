# Legacy app (2016)

The original Laya Gnana tala keeper, served at `/legacy/` so it can be compared
with the current app. The files come from the `pre-sadhana-port` tag:
`templates/home.html` became `index.html`, and `static/` keeps its layout.

Only what the page loads was copied: the `lg*.js` scripts, `dashboard.css`,
Bootstrap's minified CSS/JS and fonts, and the sounds and images that
`TalasFixtures.json` names. jQuery and jQuery UI still load from their CDNs.

Two changes from the tag:

- `/static/` paths in `index.html`, `static/js/lgview.js` and
  `TalasFixtures.json` became `/legacy/static/`.
- A "Back to Thambura" link in the navbar.

Don't fix or modernise anything else here; the point is to see it as it was.
