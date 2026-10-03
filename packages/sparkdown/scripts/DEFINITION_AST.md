# Definition AST generation

The type checker loads prepared JSON through `DefinitionFile.ts`. It does not
parse definition source at runtime. The two builtin source aggregates remain in
`EmbeddedBuiltinDefinitions.ts` as build inputs. The checked `abs` declaration is
a separate test-only fixture.

Regenerate and commit the JSON when a definition source changes:

```sh
node packages/sparkdown/scripts/buildDefinitionAst.mjs
node packages/sparkdown/scripts/buildDefinitionAst.mjs --check
```

The build uses the same vendored official-parser WASM as the AST oracle. Its
loader validates the artifact hashes and the conformance pin in `VENDORING.md`;
there is no second parser pin. Regeneration needs Node with TypeScript stripping
(Node 24 in CI), without Emscripten. Rebuilding the parser itself needs the
Emscripten version and upstream checkout documented in `VENDORING.md`.

Each JSON file contains the official AST plus a format version, the resolved
parser commit, and its source hash. Check mode parses the sources and compares
complete output bytes, so source edits, schema edits and stale output all fail.
All inputs must parse successfully before any generated output is written.

The bridge preserves checker semantics that the upstream printer omits: table
property/indexer access and access locations, extern-property method flags,
type-reference parameter-list presence, alias name locations and attribute
arguments. A global declaration uses `luauType` for its annotation, since the
upstream encoder writes two `type` keys and loses its node discriminator.
The oracle's TypeScript printer uses these same fields. Generic-name locations
are absent from the official format; the loader uses an empty location for
those nodes. Unsupported AST kinds fail visibly during loading.

`Frontend.loadDefinitionFile` takes prepared `DefinitionFile` data. New
definition inputs should be added to the build manifest, never parsed on the
author's device. Every load builds fresh node instances so checker mutations
cannot affect another frontend or the stored JSON.
