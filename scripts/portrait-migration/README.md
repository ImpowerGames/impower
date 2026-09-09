# Portrait attribute migration

This command converts the legacy include/exclude portrait project from [#483](https://github.com/ImpowerGames/impower/issues/483). It reads the input project without modifying it and writes into a separate output directory, which can be the `project` directory of an isolated worktree. Existing output files must match the input or a previous identical migration; unrelated edits stop the write. CRLF/LF differences from Git checkout are accepted.

From the impower repository, after `npm install`:

```powershell
python scripts/portrait-migration/migrate.py PATH/TO/LEGACY/project --output PATH/TO/REVIEW/project --exceptions scripts/portrait-migration/raffles-and-bunny-8d734bb-exceptions.json
```

Use `--config` to supply another project's conversion tables. The default `raffles-and-bunny.json` contains the old group words, clothing options, arm/phone poses, overlay switches, dead-layer decisions, and all 27 exact historical exception sets. This is a converter for the known legacy grammar, not a general Sparkdown source parser. It expects conventional `define ... with` blocks and quoted include/exclude lists, and refuses cycles and missing portrait images.

The output contains the converted SVGs, `scripts/portraits.sd`, rewritten `.sd` files, and `portrait-migration-report.json`. It is an overlay for the existing project: unrelated assets are not copied; every participating script is copied and hashed, including unchanged scripts. An isolated project worktree supplies those existing files. The report records source and output SHA-256 hashes, the Git source revision, every old/new visible-layer set, diagnostics, and artist notes. Image directives in all `.sd` files are considered; the main-script count also includes unused named looks, matching the design prototype's counting convention. SVG layer names are added or replaced in `data-name`; unreferenced legacy layer-name IDs are removed. Unreferenced plain child IDs become labels with only an exact nearest conditional ancestor prefix removed. Mismatched names and numeric suffixes are not guessed. Root IDs, resource IDs, referenced IDs, original export metadata, and drawing bytes are preserved. Native Affinity files are never inputs to this command.

The equivalence gate executes the production TypeScript attribute parser, vocabulary, resolver, and visibility evaluator. The legacy rules alone are reproduced in Python. It first chooses attribute spellings against full expected layer sets, then reparses the serialized output SVGs with the production SVG reader and verifies the exact attributes written to named looks. The source-to-output audit maps element paths, so obsolete IDs need not remain in the SVG. Any unlisted difference prevents source-file writes. The report is still written to make a failure reviewable. Migration and verification use one Node process at a time, capped at a 256 MB heap.

## Measured project revision

At `8d734bb03e6a011096c2ec6c533909ac0c201926`, the project contains 478 distinct audited directives, 1,064 uses, 67 named looks, and 4,185 tagged layers in 57 portrait SVGs. All 478 pass with 29 exact differences: 26 historical fixes still occur; `bunny_frustrated~phone_hold_left` no longer occurs; three newer cases are listed explicitly in `raffles-and-bunny-8d734bb-exceptions.json`:

- `bunny_serious~helmet~phone~look_left`: this SVG has no `look.left`; the invalid selection is ignored and the resting camera pupils remain visible.
- `bunny_supportive`: this named look requests eyebrows the file lacks; its resting realization eyebrows remain visible.
- `raffles_hmph~coat`: another use of the undefined old `eyebrows_hmph` filter, now correctly choosing the available hmph eyebrows.

The refreshed audit and fixture record source HEAD `46e336a577ac42e55eb39b917ad2ad5abad84b94` (`audit: separate coverage prompts`). All 90 participating source-file hashes are identical to the earlier `8d734bb` measurement; this revision change did not change the measured project artwork or scripts. The fixture and exception filenames retain the original measurement identifier.

The 57 source exports contain no references to the 4,185 obsolete layer IDs. Migration removes all of them and converts 3,998 unreferenced child IDs into plain labels. It preserves 29 other IDs, including two malformed child names listed for artist review in the report. Reference checks cover attribute values (including links, URLs, animation references, and accessibility references) and embedded CSS/script text. If another export refers to a converted layer ID, the converter conservatively retains that ID and lists it in the report instead of rewriting references.

The historical 441-directive/57-look script revision was located at `bd98257a6c8b62d25d7e36cff8f20fb54efe6eeb`. The SVGs were ignored by Git, so that commit does not identify the historical artwork. Running its scripts against the currently available art produces two additional differences (`bunny_serious~helmet~phone~look_left` and `raffles_smug`); it is not an exact reproduction of the ticket's 441/27 measurement. Source hashes in the current report and fixture make the new measurement reproducible. The migration preserves all 67 current looks rather than deleting the ten newer ones.

The current script also has 38 references to eight missing images or looks: `bunny_blushing`, `raffles_energized`, `raffles_pushing`, `raffles_straining`, `crawshay_shocked`, `mackenzie_judging`, `mackenzie_yelling`, and `mackenzie_questioning`. Twenty-five of those references used legacy tilde syntax, which is converted mechanically using qualified group attributes where applicable. The base names are preserved, no replacement artwork is invented, and these references are explicitly excluded from the 478-case art-equivalence claim. The report lists every missing reference and its use count. There are no remaining tilde directives in migrated `main.sd`.

## Regression checks

Verify the actual migrated project against the untouched source before publishing. This is the release gate; the metadata fixture below is a regression check and does not replace it:

```powershell
python scripts/portrait-migration/verify.py PATH/TO/LEGACY/project PATH/TO/REVIEW/project --exceptions scripts/portrait-migration/raffles-and-bunny-8d734bb-exceptions.json --corruption-controls
```

The verifier reads the supplied source, migration report, actual scripts, and serialized SVGs. It checks source/output hashes, the rewritten directive multiset and counts, every named look's actual attributes, source-derived old visible-layer expectations with the reviewed exceptions, and every rewritten SVG's names by element path. It also checks exact SVG bytes against the source with only the allowed `data-name` and obsolete-ID edits, accepting Git newline normalization. All 57 portraits are covered, including `bunny_annoyed`, `mackenzie_arrest`, and `mackenzie_yell`, which no current directive uses; those three actual resting looks are evaluated separately. The `--corruption-controls` option edits scratch copies only and requires a corrupted SVG name, deleted directive, and edited named-look attribute each to fail verification. The original and migrated project stay untouched.

Measured against the current project migration: 90 output-file hashes, all 57 rewritten portraits, and 478 distinct directives passed; the production evaluator checked 481 selections including the three unused resting looks. All three scratch corruption controls were rejected. This verifier uses one Node process capped at a 256 MB heap. The readable artist report now includes 100 deduplicated production diagnostics across 82 directives and 217 uses, with converted spellings and affected attributes/folders and hierarchy paths. These comprise 63 missing-folder-default, 34 missing-folder-option, and three unknown-attribute warnings; they do not change the verified visible-layer sets.

```powershell
python -m unittest discover -s scripts/portrait-migration -p test_migrate.py
python -m unittest discover -s scripts/portrait-migration -p test_verify.py
python -m unittest discover -s scripts/portrait-migration -p test_report.py
$env:NODE_OPTIONS='--max-old-space-size=1024'
node node_modules/tsx/dist/cli.mjs --test scripts/portrait-migration/equivalence.test.ts
```

The Python suites check byte-preserving SVG renaming, obsolete-ID removal, referenced/resource-ID preservation, comments and namespaces, duplicate-ID rejection, the old exclude/parent rules, later-wins ordering, a complete production-core project migration, repeatability, protection of unrelated output edits, actual-project verification and corruption detection, and readable directive diagnostics. Verifier controls also update the output hash after editing a named look, deleting a directive, corrupting an unused portrait, modifying geometry, or restoring an obsolete ID, proving that the semantic, multiset, name, and allowed-edit checks operate independently of the hash gate. Element-path tests include declarations, comments, text, resources, and anonymous groups. The initial migration and review-fix tests failed with assertions before their implementations, then passed after implementation. The metadata fixture runs 479 Node tests: one source/count check and one complete visible-layer assertion per directive. It contains names and hierarchy only, with original source IDs retained solely as audit identities and no drawing geometry.

To regenerate the metadata fixture from a successful, reviewed migration:

```powershell
python scripts/portrait-migration/snapshot.py PATH/TO/REVIEW/project scripts/portrait-migration/fixtures/raffles-and-bunny-8d734bb.json --source PATH/TO/LEGACY/project
```

Do not update the exception sets merely to make a test pass. Review each difference against the old layer set, the source art, and the intended new selection.

## Artist handoff

The current report identifies the six dead layers, seven export renames, the two-faces-on-one-layer case, the undefined `eyebrows_hmph` filter, and ten conflicting folder/group defaults in the current art. The older report counted eight; the current report preserves the specific file, folder, and options so the artist can review the drift. These defects are reported without redrawing or restructuring the art.

The converted SVGs preserve the existing export metadata. This does not establish that importing them back into Affinity preserves native palette bindings. Actual native sources were located under `G:/My Drive/Raffles & Bunny/Art/Characters/source files/`. A read-only copy of `Crawshay/c_all.afdesign` (331,790 bytes; SHA-256 `23f5db7141c7de5c01450d92a3e9417a3214525a2baafc99073214e6179a0b80`) was opened through the Affinity 3.2.3.4646 MCP server, and its five artboards were rendered and visually inspected. The originals were not modified. The available SDK documents do not expose palette-binding inspection or rebinding. A rename-only native proof changed one layer label on a separate copy, saved a new native file, and independently loaded the saved bytes: all 1,291 layers retained their order, type, visibility, opacity, bounds, and fills, and before/after/reopened render hashes matched. The full five-file migration and palette-binding preservation remain unverified. An artist must check those bindings before replacing a native source. Photoshop, Krita, and Clip Studio Paint export compatibility is tracked in [#486](https://github.com/ImpowerGames/impower/issues/486).
