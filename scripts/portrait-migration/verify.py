"""Verify an actual migrated project against its original source and audit.

Unlike equivalence.test.ts, this gate reads the supplied .sd and SVG files.
It never regenerates or modifies the migration or the original project.
"""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import legacy
import migrate


def checked_file(root, relative):
    path = (root/relative).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError(f'File escapes project directory: {relative}')
    if not path.is_file(): raise ValueError(f'Missing project file: {relative}')
    return path


def check_hashes(root, hashes, label):
    for relative,expected in hashes.items():
        data = checked_file(root,relative).read_bytes()
        # Git may check text files out with CRLF. The report hashes LF output.
        if expected not in (migrate.sha(data),migrate.sha(data.replace(b'\r\n',b'\n'))):
            raise ValueError(f'{label} hash mismatch: {relative}')


def parse_looks(text):
    if re.search(r'\bdefine\s+\w+\s+as\s+filter\s+with\b',text):
        raise ValueError('Actual portraits.sd still contains legacy filter definitions')
    result = {}
    for match in re.finditer(r'\bdefine\s+(\w+)\s+as\s+filtered_image\s+with\s*\n(.*?)\nend\b',text,re.S):
        name,body = match.groups()
        # This verifier accepts the migration's generated format, not arbitrary
        # Sparkdown. Never choose the first assignment when runtime can use a
        # later one, including a later field with an invalid value.
        for field in ('image','attributes'):
            if len(re.findall(rf'^[ \t]*{field}\b',body,re.M)) != 1:
                raise ValueError(f'{name}: expected exactly one {field} field')
        image = re.search(r'^\s*image\s*=\s*image\.(\w+)[ \t\r]*$',body,re.M)
        if not image:
            raise ValueError(f'{name}: expected a complete typed image reference (image.name)')
        fields = re.fullmatch(r'\s*image[ \t]*=[ \t]*image\.\w+[ \t\r]*\n\s*attributes[ \t]*=[ \t]*\{((?:"(?:[^"\\]|\\.)*"|[^"{}])*)\}\s*',body,re.S)
        if not fields:
            raise ValueError(f'{name}: expected generated named-look format')
        if name in result:
            raise ValueError(f'Invalid or duplicate actual named look: {name}')
        strings = re.findall(r'"(?:[^"\\]|\\.)*"',fields[1])
        residue = re.sub(r'"(?:[^"\\]|\\.)*"','',fields[1])
        if residue.strip(' \t\r\n,'):
            raise ValueError(f'{name}: attributes must be quoted strings')
        result[name] = {'image':image[1],'attributes':[json.loads(s) for s in strings]}
    return result


def actual_selection(token, looks):
    image,*own = re.split(r'[:~]',token)
    inherited,seen = [],set()
    while image in looks:
        if image in seen: raise ValueError(f'Cycle in actual named looks: {image}')
        seen.add(image)
        look = looks[image]
        inherited = look['attributes']+inherited
        image = look['image']
    return image,inherited+own


def verify_project(source, project, config, extra_exceptions=None):
    source,project = Path(source).resolve(),Path(project).resolve()
    audit = json.loads(checked_file(project,'portrait-migration-report.json').read_text())
    if audit.get('failures'): raise ValueError('Migration report contains unresolved failures')
    scripts = {p.relative_to(source).as_posix() for p in migrate.participating_scripts(source)}
    output_scripts = {p.relative_to(project).as_posix() for p in migrate.participating_scripts(project)}
    if output_scripts != scripts:
        raise ValueError(f'Output script set differs from source: added={sorted(output_scripts-scripts)}, missing={sorted(scripts-output_scripts)}')
    for label in ('sourceHashes','outputHashes'):
        missing = scripts-set(audit[label])
        if missing: raise ValueError(f'Participating script omitted from {label} hash coverage: {sorted(missing)}')
    check_hashes(source,audit['sourceHashes'],'source')
    check_hashes(project,audit['outputHashes'],'output')
    if audit.get('sourceCommit'):
        commit = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
        if commit != audit['sourceCommit']: raise ValueError('Source Git revision differs from migration report')
    legacy.configure(config,(source/'scripts/portraits.sd').read_text(encoding='utf-8-sig'))
    for name in legacy.COMPOSITES: migrate.chain(name)
    looks = parse_looks((project/'scripts/portraits.sd').read_text(encoding='utf-8-sig'))
    if set(looks) != set(legacy.COMPOSITES) or len(looks) != audit['namedLooks']:
        raise ValueError('Actual named-look set differs from source/report')

    trees,inputs,svgs,rewritten = {},{},{},set()
    for path in sorted((source/'assets').glob('*.svg')):
        tree = legacy.load_svg(path)
        trees[path.stem] = tree
        inputs[path.stem] = migrate.layer_input(tree)
        relative = path.relative_to(source).as_posix()
        if any(n.filterable() for n in migrate.nodes(tree)):
            rewritten.add(path.stem)
            if relative not in audit['sourceHashes'] or relative not in audit['outputHashes']:
                raise ValueError(f'Rewritten portrait omitted from source/output hashes: {relative}')
            # Verify every renamed layer against source-derived conversion,
            # including files no script directive happens to reference.
            converted = copy.deepcopy(tree)
            legacy.convert_tree(converted,path.stem.split('_')[0])
            converted_layers = migrate.layer_input(converted)
            expected_names = {n['key']:n['name'] for n in converted_layers if n['legacyId']}
            names_by_id = {n['legacyId']:n['name'] for n in converted_layers if n['legacyId']}
            actual_xml = ET.fromstring(checked_file(project,relative).read_bytes())
            actual_names = {key:n.get('data-name') for key,n in migrate.xml_layers(actual_xml).items() if key in expected_names}
            if actual_names != expected_names:
                raise ValueError(f'Actual SVG layer names differ from source-derived conversion: {relative}')
            expected_svg = migrate.rewrite_svg(path.read_text(encoding='utf-8-sig'),names_by_id)
            if checked_file(project,relative).read_text(encoding='utf-8-sig') != expected_svg:
                raise ValueError(f'Actual SVG changed beyond layer names and unreferenced legacy IDs: {relative}')
        svgs[path.stem] = checked_file(project,relative).read_text(encoding='utf-8-sig')
    if len(rewritten) != audit['portraitFiles']:
        raise ValueError('Rewritten portrait count differs from report')

    usage,main_usage = Counter(),Counter()
    entries = audit['directives']
    replacements = {token:entry['converted'] for token,entry in entries.items()}
    replacements.update({token:entry['converted'] for token,entry in audit.get('missingImageDirectives',{}).items()})
    for path in sorted(source.rglob('*.sd')):
        relative = path.relative_to(source)
        if relative.as_posix() == 'scripts/portraits.sd' or any(p.startswith('.') for p in relative.parts): continue
        before = path.read_text(encoding='utf-8-sig')
        after = checked_file(project,relative).read_text(encoding='utf-8-sig')
        expected_directives = []
        for match in migrate.DIRECTIVE.finditer(before):
            content = match[1]
            for token in content.split():
                if migrate.chain(token.split('~')[0])[0] in trees:
                    usage[token] += 1
                    if relative.as_posix() == 'main.sd': main_usage[token] += 1
                    break
            expected_directives.append(' '.join(replacements.get(token,token) for token in content.split()))
        actual_directives = [' '.join(m[1].split()) for m in migrate.DIRECTIVE.finditer(after)]
        if Counter(actual_directives) != Counter(expected_directives):
            raise ValueError(f'Actual directive multiset differs from rewritten source: {relative}')
        if migrate.DIRECTIVE.sub('',before) != migrate.DIRECTIVE.sub('',after):
            raise ValueError(f'Actual script changed outside directives: {relative}')
    for name in legacy.COMPOSITES:
        usage.setdefault(name,0)
        main_usage.setdefault(name,0)
    if set(usage) != set(entries): raise ValueError('Report directive set differs from source corpus')
    for key,value in [('allDistinct',len(usage)),('allUses',sum(usage.values())),('mainDistinct',len(main_usage)),('mainUses',sum(main_usage.values()))]:
        if audit[key] != value: raise ValueError(f'{key} differs from original source corpus')

    exceptions = dict(config['historical_exceptions'])
    exceptions.update(extra_exceptions or {})
    requests,expected_sets,labels,used = [],[],[],set()
    for token,entry in entries.items():
        root,_ = migrate.chain(token.split('~')[0])
        if entry['uses'] != usage[token] or entry['mainUses'] != main_usage[token]:
            raise ValueError(f'Use count differs from original source: {token}')
        old = legacy.old_visible(trees[root],legacy.old_filter_for(token))
        if set(entry['old']) != old: raise ValueError(f'Reported old layer set differs from original source: {token}')
        expected = migrate.expected_set(old,exceptions.get(token,{}))
        if set(entry['new']) != expected: raise ValueError(f'Reported new layer set differs from reviewed expectations: {token}')
        actual_root,attributes = actual_selection(entry['converted'],looks)
        if actual_root != root: raise ValueError(f'Actual named look changed root image: {token}')
        requests.append({'tree':root,'attributes':attributes})
        expected_sets.append(expected)
        labels.append(token)
        used.add(root)
    # These files still ship even though no current directive references them.
    # Check their actual serialized resting look against the old rules too.
    unused = sorted(rewritten-used)
    for name in unused:
        requests.append({'tree':name,'attributes':[]})
        expected_sets.append(legacy.old_visible(trees[name],{'includes':[],'excludes':[]}))
        labels.append(f'unused portrait resting look: {name}')
    evaluated = migrate.evaluate(inputs,requests,svgs,heap_mb=256)
    for label,expected,result in zip(labels,expected_sets,evaluated['results']):
        if set(result['visible']) != expected:
            delta = migrate.difference(expected,result['visible'])
            raise ValueError(f'Actual visible layers differ for {label}: {delta}')
    return {'sourceCommit':audit.get('sourceCommit'),'checkedOutputFiles':len(audit['outputHashes']),
            'checkedPortraits':len(rewritten),'unusedPortraits':unused,'checkedDirectives':len(entries),
            'productionSelections':len(requests)}


def corruption_controls(source, project, config, extra_exceptions=None):
    """Mutate scratch copies only; require each specific damaged file to fail."""
    source,project = Path(source).resolve(),Path(project).resolve()
    audit = json.loads((project/'portrait-migration-report.json').read_text())
    with tempfile.TemporaryDirectory(prefix='portrait-verifier-controls-') as directory:
        scratch = Path(directory)
        paths = set(audit['outputHashes']) | {'portrait-migration-report.json'}
        paths.update(p.relative_to(project).as_posix() for p in project.rglob('*.sd') if not any(part.startswith('.') for part in p.relative_to(project).parts))
        for relative in paths:
            target = scratch/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(checked_file(project,relative),target)
        svg_path = next((p for p in sorted(paths) if p.endswith('bunny_annoyed.svg')),
                        next(p for p in sorted(paths) if p.endswith('.svg') and 'data-name=' in (scratch/p).read_text()))
        controls = [('svg-name',svg_path,lambda text:text.replace('data-name="','data-name="corrupted-',1)),
                    ('directive-deletion','main.sd',lambda text:migrate.DIRECTIVE.sub('',text,count=1)),
                    ('named-look-attribute','scripts/portraits.sd',lambda text:re.sub(
                        r'(attributes\s*=\s*\{\s*)"(?:[^"\\]|\\.)*"',r'\1"corrupted-option"',text,count=1))]
        results = {}
        for name,relative,mutate in controls:
            path = scratch/relative
            original = path.read_bytes()
            changed = mutate(original.decode('utf-8-sig')).encode('utf-8')
            if changed == original: raise ValueError(f'Corruption control did not mutate {relative}')
            path.write_bytes(changed)
            try:
                verify_project(source,scratch,config,extra_exceptions)
            except ValueError as error:
                if f'output hash mismatch: {relative}' not in str(error): raise
                results[name] = True
            else:
                raise ValueError(f'Corruption control was not rejected: {name}')
            finally:
                path.write_bytes(original)
        return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('project',type=Path)
    parser.add_argument('--config',type=Path,default=migrate.HERE/'raffles-and-bunny.json')
    parser.add_argument('--exceptions',type=Path)
    parser.add_argument('--corruption-controls',action='store_true')
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text())
        exceptions = json.loads(args.exceptions.read_text()) if args.exceptions else None
        result = verify_project(args.source,args.project,config,exceptions)
        if args.corruption_controls: result['corruptionControls'] = corruption_controls(args.source,args.project,config,exceptions)
        print(json.dumps(result,indent=2))
    except (ValueError,OSError,RuntimeError) as error:
        parser.exit(1,f'{error}\n')
