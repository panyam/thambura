# Thambura

A practice companion for Carnatic music students, at https://thambura.com. It
keeps tala: pick a thaala, jaathi, gathi and kalai, set a tempo, and it claps
the cycle while showing each hand gesture (or a random swara, for singing
practice). It also plays a thambura drone (tambura, guitar or sruti) to sing
against. A mridangam accompaniment is next.

Thambura began in 2015 as *Laya Gnana*, a Google App Engine (go1) app with a
jQuery front end, and was briefly called Sadhana during the port. The tag
`pre-sadhana-port` marks the original version.

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
