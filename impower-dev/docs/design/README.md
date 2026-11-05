# Folio design reference

An art-free reference of the Folio redesign of the web editor, so that the work that
builds it and the review of that work can check a colour, a size or a string without
the prototype. The design of record is the prototype at commit `c2fe740`; where this
reference and the prototype differ, the prototype wins and this reference is corrected.

| Document | Holds |
|---|---|
| [tokens.md](./tokens.md) | The nine theme choices and every theme's semantic colours with contrast for the two defaults, the syntax palettes, type, spacing, shape, elevation, interaction tokens, breakpoints, motion, and the prototype's inconsistencies with the value chosen |
| [layouts.md](./layouts.md) | The measured geometry of the desktop, compact and phone shells, the rail's resize rules and the Scripts page, as ASCII frames |
| [glossary.md](./glossary.md) | Old words and their replacements, and the interface copy of every surface, quoted from the prototype |

## The prototype

The prototype lives in the private repository `ImpowerGames/spark-engine-redesign`, on
branch `folio-revisions`, checked out beside this repository:

```sh
git clone --branch folio-revisions https://github.com/ImpowerGames/spark-engine-redesign.git ../spark-engine-redesign
git -C ../spark-engine-redesign checkout c2fe740
```

Serve it from this machine only, bound to the loopback address:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory ../spark-engine-redesign
```

Then open `http://127.0.0.1:8765/prototype/index.html`. The routes:

| Route | Shows |
|---|---|
| `prototype/folio.html#write` | Story: the script, the rail and the preview |
| `prototype/folio.html#write?insert=blocks` | The Add menu open |
| `prototype/folio.html#write?tools=menu` | The Writing tools menu open |
| `prototype/folio.html#write?preview=console` | The Problems panel open |
| `prototype/folio.html#write?mode=screenplay` | The preview in Screenplay mode |
| `prototype/folio.html#scripts` | The Scripts page |
| `prototype/folio.html#collection` | Assets |
| `prototype/folio.html#share` | Share |
| `prototype/folio.html#project` | Settings |
| `prototype/folio.html?project=empty#write` | An empty project |

A route's options follow the `?` inside the hash (`app.js:186`, `:218-226`); Feature #977
writes them as `?insert=blocks` and so on after `#write`. The prototype's own
`prototype/README.md` lists further routes such as `#play`, `#write?preview=fullscreen`
and `#project?preference=themes`.

The prototype's markup wins over its own notes (`prototype/README.md`,
`prototype/change-list.md`, `prototype/decisions.md`) where they differ.

## Rules for using it

- The prototype's demo art (backdrops, portraits, sounds, video) may not leave the
  machine it is checked out on. No ticket, pull request, commit or document carries a
  screenshot, recording or copy of it; this reference holds no image of any kind.
- Screenshots of the editor built from this reference are fine: they show the
  repository's own sample projects, not the prototype's art.
- Every value in the reference names the stylesheet, script and line it was read from,
  relative to the prototype's `prototype/` directory, or says it was measured from the
  running page. A value that cannot be found there is a defect in this reference.
