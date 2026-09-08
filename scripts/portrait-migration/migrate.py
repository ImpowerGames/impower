"""Read-only legacy migration: write a separate project and exact equivalence report."""
import argparse
import collections
import hashlib
import html
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import legacy

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
TAG = re.compile(r'<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>')
ID = re.compile(r'(?<![\w:-])id\s*=\s*([\"\'])(.*?)\1')
DATA_NAME = re.compile(r'\s+data-name\s*=\s*([\"\'])(.*?)\1')
DIRECTIVE = re.compile(r'\[\[([^\]]*)\]\]')

def rewrite_svg(source, names):
    """Change only data-name, preserving paths, IDs, namespaces and palette metadata."""
    root = ET.fromstring(source)
    ids = [n.get('id') for n in root.iter() if n.get('id')]
    if len(set(ids)) != len(ids):
        raise ValueError('duplicate SVG ids')
    seen = set()
    def replace(match):
        tag = match[0]
        if tag.startswith(('<!--', '<![CDATA[', '<?', '<!')):
            return tag
        id_match = ID.search(tag)
        if not id_match or html.unescape(id_match[2]) not in names:
            return tag
        id_ = html.unescape(id_match[2])
        seen.add(id_)
        attr = ' data-name="' + html.escape(names[id_], quote=True) + '"'
        if DATA_NAME.search(tag):
            return DATA_NAME.sub(lambda _: attr, tag, count=1)
        return tag[:id_match.end()] + attr + tag[id_match.end():]
    result = TAG.sub(replace, source)
    if seen != set(names):
        raise ValueError(f'Could not locate source layer IDs: {sorted(set(names)-seen)}')
    for before, after in zip(root.iter(), ET.fromstring(result).iter()):
        expected = dict(before.attrib)
        if before.get('id') in names:
            expected['data-name'] = names[before.get('id')]
        if after.attrib != expected or after.tag != before.tag or after.text != before.text:
            raise ValueError(f'SVG changed beyond data-name: {before.get("id")}')
    return result

def nodes(tree):
    yield tree
    for child in tree.children:
        yield from nodes(child)

def layer_input(tree):
    layers = []
    def walk(node, key, parent=None):
        layer = {'key': key, 'name': legacy.format_new(node.new) if node.new else '',
                 'legacyId': node.id if node.filterable() else None}
        if parent is not None:
            layer['parent'] = parent
        layers.append(layer)
        for i, child in enumerate(node.children):
            walk(child, f'{key}/{i}', key)
    walk(tree, 'root')
    return layers

def evaluate(trees, requests, svgs=None, heap_mb=1024):
    """All new selections/visibility come from the production TypeScript core."""
    cli = REPO/'node_modules/tsx/dist/cli.mjs'
    if not cli.is_file():
        raise RuntimeError('Install repository dependencies first: npm install')
    run = subprocess.run(['node', str(cli), str(HERE/'evaluate.ts')],
                         input=json.dumps({'trees': trees, 'requests': requests, 'svgs': svgs}),
                         text=True, encoding='utf-8', capture_output=True, cwd=REPO,
                         env=dict(os.environ, NODE_OPTIONS=f'--max-old-space-size={heap_mb}'))
    if run.returncode:
        raise RuntimeError(f'Production evaluator failed:\n{run.stderr}\n{run.stdout[:2000]}')
    return json.loads(run.stdout)

def chain(name):
    seen, filters = set(), []
    while name in legacy.COMPOSITES:
        if name in seen:
            raise ValueError(f'cyclic named look: {name}')
        seen.add(name)
        entry = legacy.COMPOSITES[name]
        filters = entry['filters'] + filters
        name = entry['image']
    return name, filters

def flatten(parts):
    return [a for part in parts for a in part.split(':') if a]

def compact(parts):
    result = []
    for attr in flatten(parts):
        if not result or result[-1] != attr:
            result.append(attr)
    return result

def difference(old, new):
    return {'removed': sorted(set(old)-set(new)), 'added': sorted(set(new)-set(old))}

def expected_set(old, exception):
    return (set(old)-set(exception.get('removed', []))) | set(exception.get('added', []))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def check_output_path(target, output):
    # Check directory symlinks too: an assets/ link could otherwise redirect a
    # write into the read-only input even though the output root is separate.
    for path in [target,*target.parents]:
        if path == output.parent: break
        if path.is_symlink(): raise ValueError(f'Refusing symlink output: {path}')

def unresolved_attributes(filters, config):
    """Convert syntax without guessing vocabulary for a missing source image."""
    result = []
    for name in filters:
        if name in config['phone_filters']:
            result.append('arms.'+config['phone_filters'][name])
        elif name in config['clothes_filters']:
            result.append('clothes.'+config['clothes_filters'][name])
        else:
            prefix = next((p for p in config['group_filter_prefixes'] if name.startswith(p)),None)
            result.append(prefix[:-1]+'.'+name[len(prefix):].replace('_','-') if prefix else name.replace('_','-'))
    return compact(result)

def migrate(source, output, config, extra_exceptions=None):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output or source in output.parents or output in source.parents:
        raise ValueError('Input and output must be separate, non-nested project directories')
    portrait_path = source/'scripts/portraits.sd'
    legacy.configure(config, portrait_path.read_text(encoding='utf-8-sig'))
    if not legacy.FILTERS or not legacy.COMPOSITES:
        raise ValueError('Expected legacy filters and named looks in scripts/portraits.sd')
    for name in legacy.COMPOSITES:
        chain(name)
    # Include plain SVGs in the directive audit as the historical 441-case corpus
    # did; only tagged layers are renamed, so background/prop art stays intact.
    svg_files = {p.stem:p for p in sorted((source/'assets').glob('*.svg'))}
    if not svg_files:
        raise ValueError('No portrait SVGs under assets/')
    trees, inputs, indexes, outputs, hashes, notes = {}, {}, {}, {}, {}, []
    for name, path in svg_files.items():
        tree = legacy.load_svg(path)
        legacy.convert_tree(tree, name.split('_')[0])
        trees[name], inputs[name], indexes[name] = tree, layer_input(tree), legacy.group_index(tree)
        names = {n.id:legacy.format_new(n.new) for n in nodes(tree) if n.new}
        relative, original = path.relative_to(source).as_posix(), path.read_bytes()
        outputs[relative] = rewrite_svg(original.decode('utf-8-sig'), names).encode('utf-8')
        hashes[relative] = sha(original)
        for n in nodes(tree):
            if n.new:
                for note in n.new['notes']:
                    if not note.startswith('hidden by'):
                        notes.append({'file':relative, 'layer':n.id, 'name':names[n.id], 'note':note})
                if len(n.new['conds'].get('face', [])) > 1:
                    notes.append({'file':relative, 'layer':n.id, 'name':names[n.id], 'note':'layer tagged with two faces'})
    usage, main_usage, script_text, unresolved = collections.Counter(), collections.Counter(), {}, {}
    def image_token(content):
        for token in content.split():
            if chain(token.split('~')[0])[0] in trees:
                return token
        return None
    def missing_token(content):
        for token in content.split():
            base = token.split('~')[0]
            if any(base.startswith(p) for p in config['portrait_prefixes']) and chain(base)[0] not in trees:
                return token
        return None
    for path in sorted(source.rglob('*.sd')):
        relative = path.relative_to(source).as_posix()
        if path == portrait_path or any(p.startswith('.') for p in path.relative_to(source).parts):
            continue
        text = path.read_bytes().decode('utf-8-sig')
        script_text[relative] = text
        for match in DIRECTIVE.finditer(text):
            token = image_token(match[1])
            if token:
                usage[token] += 1
                if relative == 'main.sd': main_usage[token] += 1
            else:
                missing = missing_token(match[1])
                if missing:
                    base,*filters = missing.split('~')
                    entry = unresolved.setdefault(missing,{'image':base,'uses':0,'files':[],
                        'converted':':'.join([base]+unresolved_attributes(filters,config))})
                    entry['uses'] += 1
                    if relative not in entry['files']: entry['files'].append(relative)
    for name in legacy.COMPOSITES:
        usage.setdefault(name,0)
        main_usage.setdefault(name,0)
    expected = dict(config['historical_exceptions'])
    expected.update(extra_exceptions or {})
    candidates, requests, old_sets, ranges = {}, [], {}, {}
    for token in sorted(usage):
        base, *own = token.split('~')
        root, inherited = chain(base)
        if root not in trees: raise ValueError(f'{token}: missing {root}.svg')
        names = inherited + own
        for name in names:
            if name not in legacy.FILTERS:
                notes.append({'file':'scripts/portraits.sd', 'layer':token, 'note':f'undefined legacy filter: {name}'})
        lists = [legacy.convert_filter_name(name,indexes[root],names) for name in names]
        combos = sorted(itertools.product(*lists),key=lambda c:(sum(map(len,c)),c)) if lists else [()]
        candidates[token] = (root,base,len(inherited),combos)
        old_sets[token] = legacy.old_visible(trees[root],legacy.old_filter_for(token))
        start = len(requests)
        requests.extend({'tree':root,'attributes':flatten(c)} for c in combos)
        ranges[token] = (start,len(requests))
    evaluated = evaluate(inputs,requests)
    chosen, failures = {}, []
    for token,(root,base,count,combos) in candidates.items():
        start,end = ranges[token]
        desired = expected_set(old_sets[token],expected.get(token,{}))
        index = next((i for i,r in enumerate(evaluated['results'][start:end]) if set(r['visible']) == desired),0)
        combo, result = combos[index],evaluated['results'][start+index]
        attrs = compact(combo[count:])
        chosen[token] = {'root':root,'base':base,'baseAttributes':compact(combo[:count]),'attributes':attrs,
                         'old':sorted(old_sets[token]),'new':sorted(result['visible']),
                         'uses':usage[token],'mainUses':main_usage[token], 'converted':':'.join([base]+attrs),
                         'difference':difference(old_sets[token],result['visible'])}
        if set(result['visible']) != desired:
            failures.append({'directive':token,'expected':sorted(desired),'actual':sorted(result['visible'])})
    looks = []
    for name in legacy.COMPOSITES:
        entry = chosen[name]
        attrs = ', '.join(json.dumps(a) for a in entry['baseAttributes'])
        looks.append(f'define {name} as filtered_image with\n  image = {entry["root"]}\n  attributes = {{ {attrs} }}\nend\n')
    outputs['scripts/portraits.sd'] = ('\n'.join(looks).rstrip()+'\n').encode('utf-8')
    hashes['scripts/portraits.sd'] = sha(portrait_path.read_bytes())
    for relative,text in script_text.items():
        def replace(match):
            token = image_token(match[1])
            if token: return '[['+match[1].replace(token,chosen[token]['converted'],1)+']]'
            missing = missing_token(match[1])
            return '[['+match[1].replace(missing,unresolved[missing]['converted'],1)+']]' if missing else match[0]
        converted = DIRECTIVE.sub(replace,text)
        if converted != text:
            outputs[relative] = converted.encode('utf-8')
            hashes[relative] = sha((source/relative).read_bytes())
    # Assert the attributes actually written to named-look definitions compose correctly.
    actual_requests = [{'tree':e['root'],'attributes':
                       (chosen[e['base']]['baseAttributes'] if e['base'] in legacy.COMPOSITES else [])+e['attributes']}
                       for e in chosen.values()]
    actual = evaluate(inputs,actual_requests,{name:outputs[path.relative_to(source).as_posix()].decode('utf-8')
                                              for name,path in svg_files.items()})
    for (token,entry),result in zip(chosen.items(),actual['results']):
        if set(result['visible']) != set(entry['new']):
            failures.append({'directive':token,'reason':'serialized named look changes candidate result',
                             'expected':entry['new'],'actual':sorted(result['visible'])})
        entry['diagnostics'] = result['diagnostics']
    try:
        commit = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True,stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError,FileNotFoundError): commit = None
    report = {'sourceCommit':commit,'sourceHashes':hashes,'outputHashes':{k:sha(v) for k,v in outputs.items()},
              'mainDistinct':len(main_usage),'mainUses':sum(main_usage.values()),'allDistinct':len(chosen),
              'allUses':sum(usage.values()),'namedLooks':len(looks),
              'portraitFiles':sum(any(name.startswith(p) for p in config['portrait_prefixes']) for name in trees),
              'auditImageFiles':len(trees),
              'convertedLayers':sum(n.new is not None for t in trees.values() for n in nodes(t)),
              'differences':{k:v['difference'] for k,v in chosen.items() if any(v['difference'].values())},
              'missingHistoricalDirectives':sorted(set(config['historical_exceptions'])-set(main_usage)),
              'missingImageDirectives':unresolved,
              'artNotes':notes,'vocabularyDiagnostics':evaluated['diagnostics'],'directives':chosen,'failures':failures}
    output.mkdir(parents=True,exist_ok=True)
    report_path = output/'portrait-migration-report.json'
    check_output_path(report_path,output)
    previous = json.loads(report_path.read_text()) if report_path.exists() else {}
    prior_hashes = previous.get('writtenOutputHashes',previous.get('outputHashes',{}))
    report['writtenOutputHashes'] = prior_hashes
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if failures: raise ValueError(f'{len(failures)} unexpected visible-layer results; review {report_path}')
    for relative,data in outputs.items():
        target = output/relative
        check_output_path(target,output)
        if target.exists():
            current = target.read_bytes().replace(b'\r\n',b'\n')
            original = (source/relative).read_bytes().replace(b'\r\n',b'\n')
            known_previous = previous.get('sourceHashes',{}).get(relative) == hashes[relative] and sha(target.read_bytes()) == prior_hashes.get(relative)
            if current not in (original,data.replace(b'\r\n',b'\n')) and not known_previous:
                raise ValueError(f'Refusing unrelated output changes: {target}')
    for relative,data in outputs.items():
        target = output/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
    report['writtenOutputHashes'] = report['outputHashes']
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,help='Legacy project directory containing main.sd, scripts/, assets/')
    parser.add_argument('--output',required=True,type=Path,help='Separate output project directory or isolated worktree/project')
    parser.add_argument('--config',type=Path,default=HERE/'raffles-and-bunny.json')
    parser.add_argument('--exceptions',type=Path,help='Reviewed additions to exact historical exception sets')
    args = parser.parse_args()
    try:
        report = migrate(args.source,args.output,json.loads(args.config.read_text(encoding='utf-8')),
                         json.loads(args.exceptions.read_text(encoding='utf-8')) if args.exceptions else None)
        print(json.dumps({k:report[k] for k in ['sourceCommit','mainDistinct','mainUses','namedLooks','portraitFiles','convertedLayers']}))
        print(f'PASS: {len(report["differences"])} asserted differences; no unexpected differences.')
    except (ValueError,RuntimeError,OSError) as error: parser.exit(1,f'{error}\n')

if __name__ == '__main__': main()
