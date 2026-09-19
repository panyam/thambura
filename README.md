# Sadhana

A practice companion for Carnatic music students. Today it keeps tala: pick a
thaala, jaathi, gathi and kalai, set a tempo, and it claps the cycle while
showing each hand gesture (or a random swara, for singing practice). A shruthi
box and a mridangam accompaniment are next.

Sadhana began in 2015 as *Laya Gnana*, a Google App Engine (go1) app with a
jQuery front end. The tag `pre-sadhana-port` marks that version.

## Running

Needs Go, Node and pnpm.

```sh
make run          # builds the frontend, then serves on :8000 (PORT=... to change)
make test         # Go tests, TS typecheck, vitest
```

`make watch` rebuilds the bundle on change while `make run` is up. The server
warns at startup if the frontend hasn't been built.

## Layout

```
main.go                 server entry: PORT, -web dir
internal/web/           goapplib pages (HomePage) and the /static file server
internal/brand/         the display name
web/templates/          templar templates; goapplib's are vendored in templar_modules/
web/static/Resources/   sounds, images, TalasFixtures.json
web/src/engine/         pure TS: tala tables, beat cursor, sequencer, asset groups
web/src/player/         audio mixer, look-ahead transport, presenter, Solid view
```

See [CLAUDE.md](CLAUDE.md) for how the pieces fit together and [NEXTSTEPS.md](NEXTSTEPS.md) for what comes next.
