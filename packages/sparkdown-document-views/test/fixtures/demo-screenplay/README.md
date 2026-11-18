# Demo screenplay fixtures

`chapter_1.sd`, `chapter_2.sd`, `chapter_3.sd` and `epilogue.sd` are text-only
snapshots of `demo-project/Scripts/` from `ImpowerGames/spark-engine-redesign`
commit `b1855be8eafdbb84c80ae823750e6b1d1773160b`. `verify_screenplay.sd` and
`verify_start.sd` add dialogue, a choice, one-line and multi-line alternatives,
an if block, a centred line and an interpolation at the start of a line.

The geometry test prints each script to PDF and draws it on the Screenplay page,
then compares every row's text, left edge and line breaks. Image and sound
directives are parser input only; the test loads no assets.
