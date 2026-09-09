"""Capture reproducible attribute metadata and old layer sets, never drawing data."""
import argparse
import legacy
import json
from pathlib import Path
import xml.etree.ElementTree as ET

def snapshot(project, report, source):
    trees = {}
    for image in sorted({entry['root'] for entry in report['directives'].values()}):
        root = ET.fromstring((project/'assets'/f'{image}.svg').read_bytes())
        original = ET.fromstring((source/'assets'/f'{image}.svg').read_bytes())
        layers = []
        def walk(node, before, key, parent=None):
            children = list(node)
            # Only scopes leading to a conditional group are needed; paint
            # geometry and unrelated SVG metadata never enter the fixture.
            tagged = bool(legacy.IS_FILTERABLE.search(before.get('id','')))
            descendants = any(legacy.IS_FILTERABLE.search(n.get('id','')) for n in before.iter())
            if not descendants:
                return
            layers.append({'key':key,'name':node.get('data-name','') if tagged else '',
                           **({'parent':parent} if parent else {}),
                           **({'id':before.get('id')} if tagged else {})})
            for index,child in enumerate(children):
                walk(child,before[index],f'{key}/{index}',key)
        walk(root,original,'root')
        trees[image] = layers
    cases = []
    for token,entry in report['directives'].items():
        base = report['directives'].get(entry['base'])
        inherited = base['baseAttributes'] if base else []
        cases.append({'directive':token,'image':entry['root'],
                      'attributes':inherited+entry['attributes'],'old':entry['old']})
    return {'sourceCommit':report['sourceCommit'],'sourceHashes':report['sourceHashes'],'trees':trees,'cases':cases}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--source',required=True,type=Path,help='Untouched legacy project for audit layer identities')
    args = parser.parse_args()
    report = json.loads((args.project/'portrait-migration-report.json').read_text())
    if report['failures']:
        parser.error('Cannot snapshot a failed migration')
    result = snapshot(args.project,report,args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
