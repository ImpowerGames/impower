"""Verifier checks supplied project files, including otherwise unused portraits."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import verify


def sample(root):
    source, project = root/'source', root/'project'
    for folder in [source,project]:
        (folder/'assets').mkdir(parents=True)
        (folder/'scripts').mkdir()
    before = '<svg><g id="filter-face-neutral-default"/><g id="filter-face-happy"/></svg>'
    after = '<svg><g id="filter-face-neutral-default" data-name="face.neutral:default"/><g id="filter-face-happy" data-name="face.happy"/></svg>'
    source_files = {
        'assets/mia.svg':before, 'assets/mia_unused.svg':before,
        'main.sd':'[[mia~face_happy]]\n[[party]]\n',
        'scripts/portraits.sd':'define face_happy as filter with\n includes = { "face-happy" }\n excludes = { "face-(?!happy)" }\nend\ndefine party as filtered_image with\n image = mia\n filters = { face_happy }\nend\n',
    }
    output_files = {
        'assets/mia.svg':after, 'assets/mia_unused.svg':after,
        'main.sd':'[[mia:happy]]\n[[party]]\n',
        'scripts/portraits.sd':'define party as filtered_image with\n image = mia\n attributes = { "happy" }\nend\n',
    }
    for path,text in source_files.items(): (source/path).write_bytes(text.encode())
    for path,text in output_files.items(): (project/path).write_bytes(text.encode())
    report = {'sourceCommit':None,
              'sourceHashes':{path:hashlib.sha256(text.encode()).hexdigest() for path,text in source_files.items()},
              'outputHashes':{path:hashlib.sha256(text.encode()).hexdigest() for path,text in output_files.items()},
              'mainDistinct':2,'mainUses':2,'allDistinct':2,'allUses':2,'namedLooks':1,'portraitFiles':2,
              'directives':{
                  'mia~face_happy':{'root':'mia','converted':'mia:happy','old':['filter-face-happy'],'new':['filter-face-happy'],'uses':1,'mainUses':1},
                  'party':{'root':'mia','converted':'party','old':['filter-face-happy'],'new':['filter-face-happy'],'uses':1,'mainUses':1},
              },'missingImageDirectives':{},'failures':[]}
    (project/'portrait-migration-report.json').write_text(json.dumps(report))
    config = json.loads((Path(__file__).parent/'raffles-and-bunny.json').read_text())
    config.update(clothes_filters={},phone_filters={},historical_exceptions={},portrait_prefixes=['mia'])
    return source,project,config,report


class VerifyTests(unittest.TestCase):
    def test_checks_actual_files_and_all_unused_portraits(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,audit = sample(Path(directory))
            result = verify.verify_project(source,project,config)
            self.assertEqual(result['checkedPortraits'],2)
            self.assertEqual(result['unusedPortraits'],['mia_unused'])
            self.assertEqual(result['checkedDirectives'],2)
            unused = project/'assets/mia_unused.svg'
            unused.write_text(unused.read_text().replace('data-name="face.happy"','data-name="face.sad"'))
            audit['outputHashes']['assets/mia_unused.svg'] = hashlib.sha256(unused.read_bytes()).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(audit))
            with self.assertRaisesRegex(ValueError,'Actual SVG layer names'):
                verify.verify_project(source,project,config)

    def test_actual_svg_directive_and_named_look_corruption_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,_ = sample(Path(directory))
            controls = verify.corruption_controls(source,project,config)
            self.assertEqual(set(controls),{'svg-name','directive-deletion','named-look-attribute'})
            self.assertTrue(all(controls.values()))

    def test_semantics_reject_changed_named_look_even_with_updated_output_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,report = sample(Path(directory))
            path = project/'scripts/portraits.sd'
            path.write_text(path.read_text().replace('"happy"','"neutral"'))
            report['outputHashes']['scripts/portraits.sd'] = hashlib.sha256(path.read_bytes()).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError,'visible layers'):
                verify.verify_project(source,project,config)

    def test_directive_multiset_rejects_deletion_even_with_updated_output_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,report = sample(Path(directory))
            path = project/'main.sd'
            path.write_text('[[party]]\n')
            report['outputHashes']['main.sd'] = hashlib.sha256(path.read_bytes()).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError,'directive multiset'):
                verify.verify_project(source,project,config)


if __name__ == '__main__': unittest.main()
