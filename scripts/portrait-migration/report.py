"""Turn the exact JSON migration audit into a readable artist handoff."""
import argparse
import json
from pathlib import Path

def render(report):
    lines = ['# Portrait migration report', '',
             f'Source commit: `{report["sourceCommit"]}`. Source/output hashes and complete layer sets are in `portrait-migration-report.json`.', '',
             f'{report["mainDistinct"]} distinct main-script directives and named looks; {report["mainUses"]} uses; {report["namedLooks"]} named looks; {report["portraitFiles"]} portrait SVGs; {report["convertedLayers"]} tagged layers.', '',
             f'Production-core equivalence: {len(report["differences"])} explicitly asserted differences, {len(report["failures"])} unexpected differences. Serialized SVGs and named-look attributes were checked a second time.', '',
             'The source SVGs were ignored by Git. The current source hashes are part of this audit. The historical ticket described 441 directives, 57 looks and 27 fixes; the current revision has ten additional looks and newer directives/art. The missing historical directive is: '+', '.join('`'+x+'`' for x in report['missingHistoricalDirectives'])+'.', '',
             '## Missing source images', '',
             'These pre-existing references have no source image or named look. Their syntax is migrated mechanically, but they are excluded from visible-layer equivalence. No replacement image or face is invented.', '']
    for token,entry in report.get('missingImageDirectives',{}).items():
        lines.append(f'- `{token}` ({entry["uses"]} uses): `[[{entry["converted"]}]]`; missing `{entry["image"]}`; files: '+', '.join(entry['files'])+'.')
    lines += ['', '## Exact differences', '']
    for token,change in report['differences'].items():
        entry = report['directives'][token]
        lines += [f'### `{token}`', '', f'File: `assets/{entry["root"]}.svg`. Migrated directive: `[[{entry["converted"]}]]`.', '']
        for name in change['removed']: lines.append(f'- Old shows; new hides: `{name}`.')
        for name in change['added']: lines.append(f'- New shows; old hides: `{name}`.')
        lines.append('')
    lines += ['## Artist notes', '']
    for note in report['artNotes']:
        lines.append(f'- `{note["file"]}` / `{note["layer"]}`: {note["note"]}.' + (f' New name: `{note["name"]}`.' if 'name' in note else ''))
    lines += ['', '## Conflicting defaults', '']
    for file,diagnostics in report['vocabularyDiagnostics'].items():
        for diagnostic in diagnostics:
            if diagnostic['code'] == 'conflicting-defaults':
                lines.append(f'- `assets/{file}.svg`: {diagnostic["message"]}')
    lines += ['', '## Affinity handoff', '',
              'Migration changes only SVG `data-name` attributes and script syntax. Native Affinity originals remain untouched. A read-only copy of `Crawshay/c_all.afdesign` (331,790 bytes; SHA-256 `23f5db7141c7de5c01450d92a3e9417a3214525a2baafc99073214e6179a0b80`) was opened through Affinity 3.2.3.4646 MCP; five artboards were rendered and visually inspected. Existing SVG palette/color metadata is preserved byte-for-byte, but palette-binding preservation after native SVG re-import has not been verified. The available Affinity SDK documents do not expose swatch-binding inspection or rebinding, so a native rename-only alternative has not been verified either. An artist must check the imported document against the original palette before replacing a native source.', '',
              'Real Photoshop, Krita and Clip Studio Paint export compatibility is tracked separately in [impower #486](https://github.com/ImpowerGames/impower/issues/486).', '']
    return '\n'.join(lines)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    args.output.write_text(render(json.loads(args.report.read_text())),encoding='utf-8')
