# Large screenplay fixture

`large-screenplay.sd` is a pinned, text-only snapshot of `project/main.sd` from
`ImpowerGames/raffles-and-bunny-screenplay` commit
`927470f94bc3bfc6e388acf179696b3350ee8bd0`.

The snapshot is committed here so the document-view tests need no sibling
checkout, Google Drive files, network access, or current project assets. Image
and sound directives are parser input only; the tests do not load those assets.

The original UTF-8 snapshot is 169,773 bytes; its SHA-256 with LF line endings is
`7dd244e0a7bcaeb550cad4d0df4e2009da08b6283a868be11ec076974aa13531`.
The fixture loader normalizes checkout line endings before calculating edit
offsets, matching CodeMirror's document representation.
Trailing dialogue spaces are retained from the original snapshot; the local
Git attribute exempts only this fixture from end-of-line whitespace warnings.

Keep the large surrounding document: small snippets miss the incremental parse
and distant-edit cases. The tests edit its title, subway action line, and dual
dialogue passage. This historical text deliberately preserves those exact
anchors; do not refresh it automatically from the live screenplay.
