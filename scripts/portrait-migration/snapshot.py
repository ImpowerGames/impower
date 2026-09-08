"""Capture reproducible attribute metadata and old layer sets, never drawing data."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

def snapshot(project, report):
    trees = {}
    for image in sorted({entry['root'] for entry in report['directives'].values()}):
        root = ET.fromstring((project/'assets'/f'{image}.svg').read_bytes())
        layers = []
        def walk(node, key, parent=None):
            children = list(node)
            # Only scopes leading to a conditional group are needed; paint
            # geometry and unrelated SVG metadata never enter the fixture.
            tagged = node.get('data-name') is not None
            descendants = any(n.get('data-name') is not None for n in node.iter())
            if not descendants:
                return
            layers.append({'key':key,'name':node.get('data-name',''),
                           **({'parent':parent} if parent else {}),
                           **({'id':node.get('id')} if tagged else {})})
            for index,child in enumerate(children):
                walk(child,f'{key}/{index}',key)
        walk(root,'root')
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
    args = parser.parse_args()
    report = json.loads((args.project/'portrait-migration-report.json').read_text())
    if report['failures']:
        parser.error('Cannot snapshot a failed migration')
    result = snapshot(args.project,report)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
