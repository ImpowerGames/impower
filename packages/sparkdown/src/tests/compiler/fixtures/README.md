# Historical portrait corpus

`raffles-and-bunny-8d734bb.json` preserves the named layer trees and 478 distinct
portrait selections measured during the Raffles and Bunny attribute migration
([Impower #483](https://github.com/ImpowerGames/impower/issues/483)). It omits
drawing geometry. It is a historical regression corpus, not the current artwork.

The source project is
[ImpowerGames/raffles-and-bunny-screenplay](https://github.com/ImpowerGames/raffles-and-bunny-screenplay).
The fixture records source commit `46e336a577ac42e55eb39b917ad2ad5abad84b94` and
SHA-256 hashes for all 90 participating source files. Those hashes match the
original measurement at `8d734bb03e6a011096c2ec6c533909ac0c201926`; the intervening
coverage-prompt changes did not change the measured artwork or scripts. The
filename retains that original measurement identifier.

Each case's `expected` array is the reviewed post-migration visible-layer set.
The 29 reviewed differences from legacy behavior are already incorporated:
26 applicable historical fixes and three additional cases (`bunny_serious~helmet~phone~look_left`,
`bunny_supportive`, and `raffles_hmph~coat`). The tests do not depend on legacy
conversion rules or exception tables. Original SVG IDs remain stable assertion
identities here; production attribute selection reads layer names, not those IDs.
The legacy `directive` text identifies each historical case; the `attributes`
array is the actual resolver input.

`AttributePortraitCorpus.test.ts` checks all visible-layer sets, and
`AttributeBunnyFixture.test.ts` exercises SVG vocabulary construction using the
same tree. These tests run in the normal Sparkdown Vitest suite:

```sh
npm run test:run --workspace @impower/sparkdown
```
