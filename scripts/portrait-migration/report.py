"""Turn the exact JSON migration audit into a readable artist handoff."""
import argparse
import json
from pathlib import Path

def directive_diagnostics(report):
    entries = []
    for original,entry in report['directives'].items():
        unique = {}
        for diagnostic in entry.get('diagnostics',[]):
            key = tuple(diagnostic.get(field,'') for field in ['code','severity','folder','attribute','group','layer','path','message'])
            unique.setdefault(key,diagnostic)
        if unique: entries.append((original,entry,list(unique.values())))
    count = sum(len(diagnostics) for _,_,diagnostics in entries)
    uses = sum(entry['uses'] for _,entry,_ in entries)
    lines = ['## Directive diagnostics','',
             f'{count} diagnostics across {len(entries)} directives and {uses} uses. Equivalent layer sets can still carry warnings: an attribute may be ignored, or one folder may lack the selected option.','']
    for original,entry,diagnostics in entries:
        use_label = 'use' if entry['uses'] == 1 else 'uses'
        lines += [f'### `[[{entry["converted"]}]]` — {entry["uses"]} {use_label}','',f'Original: `{original}`.','']
        for diagnostic in diagnostics:
            details = [f'{field}: `{diagnostic[field]}`' for field in ['attribute','folder','group','layer','path'] if diagnostic.get(field)]
            scope = ' ('+'; '.join(details)+')' if details else ''
            lines.append(f'- `{diagnostic["code"]}`{scope}: {diagnostic["message"]}')
        lines.append('')
    return '\n'.join(lines)

def render(report):
    lines = ['# Portrait migration report', '',
             f'Source commit: `{report["sourceCommit"]}`. Source/output hashes and complete layer sets are in `portrait-migration-report.json`.', '',
             f'{report["mainDistinct"]} distinct main-script directives and named looks; {report["mainUses"]} uses; {report["namedLooks"]} named looks; {report["portraitFiles"]} portrait SVGs; {report["convertedLayers"]} tagged layers.', '',
             f'Production-core equivalence: {len(report["differences"])} explicitly asserted differences, {len(report["failures"])} unexpected differences. Serialized SVGs and named-look attributes were checked a second time.', '',
             'The source SVGs were ignored by Git. The current source hashes are part of this audit. The historical ticket described 441 directives, 57 looks and 27 fixes; the current revision has ten additional looks and newer directives/art. The missing historical directive is: '+', '.join('`'+x+'`' for x in report['missingHistoricalDirectives'])+'.', '',
             '## SVG ID cleanup', '',
             f'{report["svgIdCleanup"]["removedLayerIds"]} unreferenced legacy layer-name IDs were removed. {report["svgIdCleanup"].get("removedChildIds",0)} unreferenced plain child IDs became labels with only exact nearest-ancestor prefixes removed. {report["svgIdCleanup"]["preservedOtherIds"]} other IDs were preserved; {len(report["svgIdCleanup"]["preservedLayerIds"])} converted layer IDs were retained because they identify the root or may be referenced. Names live in `data-name`. Drawing bytes and render references remain unchanged. Old IDs in the audit identify original source layers by element path; they are not reintroduced into the output SVGs.', '',
             '## Missing source images', '',
             'These pre-existing references have no source image or named look. Their syntax is migrated mechanically, but they are excluded from visible-layer equivalence. No replacement image or face is invented.', '']
    retained = report['svgIdCleanup'].get('retainedChildIds',[])
    if retained:
        insertion = lines.index('## Missing source images')
        details = ['Retained child IDs requiring review:', '']
        details += [f'- `{item["file"]}`: `{item["id"]}`  -  {item["reason"]}.' for item in retained]
        details += ['', 'Mismatched copied prefixes remain descriptive labels; this migration does not invent replacement artist names or conditions.', '']
        lines[insertion:insertion] = details
    for token,entry in report.get('missingImageDirectives',{}).items():
        lines.append(f'- `{token}` ({entry["uses"]} uses): `[[{entry["converted"]}]]`; missing `{entry["image"]}`; files: '+', '.join(entry['files'])+'.')
    lines += ['', '## Exact differences', '']
    for token,change in report['differences'].items():
        entry = report['directives'][token]
        lines += [f'### `{token}`', '', f'File: `assets/{entry["root"]}.svg`. Migrated directive: `[[{entry["converted"]}]]`.', '']
        for name in change['removed']: lines.append(f'- Old shows; new hides: `{name}`.')
        for name in change['added']: lines.append(f'- New shows; old hides: `{name}`.')
        lines.append('')
    lines += [directive_diagnostics(report),'## Artist notes', '']
    for note in report['artNotes']:
        lines.append(f'- `{note["file"]}` / `{note["layer"]}`: {note["note"]}.' + (f' New name: `{note["name"]}`.' if 'name' in note else ''))
    lines += ['', '## Conflicting defaults', '']
    for file,diagnostics in report['vocabularyDiagnostics'].items():
        for diagnostic in diagnostics:
            if diagnostic['code'] == 'conflicting-defaults':
                lines.append(f'- `assets/{file}.svg`: {diagnostic["message"]}')
    lines += ['', '## Affinity handoff', '',
              'Migration changes SVG `data-name` attributes, removes unreferenced legacy layer-name IDs, and rewrites script syntax. Native Affinity originals remain untouched. A read-only copy of `Crawshay/c_all.afdesign` (331,790 bytes; SHA-256 `23f5db7141c7de5c01450d92a3e9417a3214525a2baafc99073214e6179a0b80`) was opened through Affinity 3.2.3.4646 MCP; five artboards were rendered and visually inspected. Existing SVG palette/color metadata is preserved byte-for-byte, but palette-binding preservation after native SVG re-import has not been verified. The available Affinity SDK documents do not expose swatch-binding inspection or rebinding. A separate native rename/save/reopen proof preserved all 1,291 layers and produced identical before/after/reopened render hashes. The full five-file migration and palette bindings remain unverified. An artist must check the imported document against the original palette before replacing a native source.', '',
              'Real Photoshop, Krita and Clip Studio Paint export compatibility is tracked separately in [impower #486](https://github.com/ImpowerGames/impower/issues/486).', '']
    return '\n'.join(lines)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    args.output.write_text(render(json.loads(args.report.read_text())),encoding='utf-8')
