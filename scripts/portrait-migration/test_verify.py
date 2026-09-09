"""Verifier checks supplied project files, including otherwise unused portraits."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import verify
from unittest.mock import patch


def sample(root):
    source, project = root/'source', root/'project'
    for folder in [source,project]:
        (folder/'assets').mkdir(parents=True)
        (folder/'scripts').mkdir()
    # XML declaration, comments, text, resources and anonymous scopes exercise
    # element-path mapping without relying on IDs in the migrated artwork.
    prefix = '<?xml version="1.0"?><svg><defs><path id="shape" d="M0 0"/></defs><!-- artist note --><g>text'
    before = prefix+'<g id="filter-face-neutral-default"/><g id="filter-face-happy"/></g></svg>'
    after = prefix+'<g data-name="face.neutral:default"/><g data-name="face.happy"/></g></svg>'
    source_files = {
        'assets/mia.svg':before, 'assets/mia_unused.svg':before,
        'main.sd':'[[mia~face_happy]]\n[[party]]\n',
        'scripts/portraits.sd':'define face_happy as filter with\n includes = { "face-happy" }\n excludes = { "face-(?!happy)" }\nend\ndefine party as filtered_image with\n image = mia\n filters = { face_happy }\nend\n',
    }
    output_files = {
        'assets/mia.svg':after, 'assets/mia_unused.svg':after,
        'main.sd':'[[mia:happy]]\n[[party]]\n',
        'scripts/portraits.sd':'define party as filtered_image with\n image = image.mia\n attributes = { "happy" }\nend\n',
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
    def test_output_only_script_is_rejected_even_if_added_to_hashes(self):
        for add_hash in (False, True):
            with self.subTest(add_hash=add_hash), tempfile.TemporaryDirectory() as directory:
                source,project,config,audit = sample(Path(directory))
                extra = project/'scripts/output_only.sd'
                extra.write_text('[[mia:face.unknown]]\n')
                if add_hash:
                    audit['outputHashes']['scripts/output_only.sd'] = hashlib.sha256(extra.read_bytes()).hexdigest()
                    (project/'portrait-migration-report.json').write_text(json.dumps(audit))
                # Isolate script inventory from the separate typed-reference migration.
                with patch('verify.parse_looks', return_value={'party':{'image':'mia','attributes':['happy']}}):
                    with self.assertRaisesRegex(ValueError, 'Output script set differs.*output_only.sd'):
                        verify.verify_project(source,project,config)

    def test_named_looks_require_complete_typed_image_references(self):
        def look(reference):
            return f'define party as filtered_image with\n image = {reference}\n attributes = {{ "happy" }}\nend\n'
        self.assertEqual(verify.parse_looks(look("image.mia"))["party"]["image"], "mia")
        for reference in ("mia", "image.mia.extra", "image.mia + 1"):
            with self.subTest(reference=reference), self.assertRaisesRegex(ValueError, "typed image reference"):
                verify.parse_looks(look(reference))

    def test_unhashed_participating_script_is_rejected_even_if_both_copies_match(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,audit = sample(Path(directory))
            for root in (source,project): (root/'scripts/extra.sd').write_text('tampered prose')
            with patch('migrate.evaluate', side_effect=AssertionError('must reject before evaluator')):
                with self.assertRaisesRegex(ValueError,'script.*hash'):
                    verify.verify_project(source,project,config)

    def test_named_looks_reject_duplicate_semantic_fields(self):
        valid = 'define party as filtered_image with\n image = image.mia\n attributes = { "happy" }\nend\n'
        self.assertEqual(verify.parse_looks(valid), {'party':{'image':'mia','attributes':['happy']}})
        for field,assignment in (
            ('image','image = image.bob'),
            ('image','image = image.bob.extra'),
            ('image','image ='),
            ('attributes','attributes = { "neutral" }'),
            ('attributes','attributes = {'),
            ('attributes','attributes ='),
        ):
            with self.subTest(assignment=assignment), self.assertRaisesRegex(ValueError, f'exactly one {field}'):
                verify.parse_looks(valid.replace('\nend',f'\n {assignment}\nend'))

    def test_named_looks_reject_unconsumed_body_content(self):
        for extra in (' image = image.bob', ' attributes = { "neutral" }', ' + 1'):
            text = 'define party as filtered_image with\n image = image.mia\n attributes = { "happy" }'+extra+'\nend\n'
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'generated named-look format'):
                verify.parse_looks(text)

    def test_duplicate_named_look_fields_rejected_with_updated_output_hash(self):
        for assignment in ('image = image.bob', 'attributes = { "neutral" }'):
            with self.subTest(assignment=assignment), tempfile.TemporaryDirectory(prefix='r3-fix-migration-') as directory:
                source,project,config,report = sample(Path(directory))
                path = project/'scripts/portraits.sd'
                path.write_text(path.read_text().replace('\nend',f'\n {assignment}\nend'))
                report['outputHashes']['scripts/portraits.sd'] = hashlib.sha256(path.read_bytes()).hexdigest()
                (project/'portrait-migration-report.json').write_text(json.dumps(report))
                with patch('migrate.evaluate', side_effect=AssertionError('must reject before evaluator')):
                    with self.assertRaisesRegex(ValueError, 'exactly one'):
                        verify.verify_project(source,project,config)

    def test_pinned_unchanged_script_detects_matching_source_and_output_tamper(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,audit = sample(Path(directory))
            original = b'original prose'
            for hashes in ('sourceHashes','outputHashes'):
                audit[hashes]['scripts/extra.sd'] = hashlib.sha256(original).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(audit))
            for root in (source,project): (root/'scripts/extra.sd').write_text('same tampered prose')
            with patch('migrate.evaluate', side_effect=AssertionError('must reject before evaluator')):
                with self.assertRaisesRegex(ValueError,'source hash mismatch: scripts/extra.sd'):
                    verify.verify_project(source,project,config)

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

    def test_drawing_edit_is_rejected_even_with_updated_output_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,report = sample(Path(directory))
            path = project/'assets/mia.svg'
            path.write_text(path.read_text().replace('d="M0 0"','d="M1 1"'))
            report['outputHashes']['assets/mia.svg'] = hashlib.sha256(path.read_bytes()).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError,'beyond layer names'):
                verify.verify_project(source,project,config)

    def test_obsolete_id_is_rejected_even_with_updated_output_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            source,project,config,report = sample(Path(directory))
            path = project/'assets/mia.svg'
            path.write_text(path.read_text().replace('data-name="face.happy"','id="filter-face-happy" data-name="face.happy"'))
            report['outputHashes']['assets/mia.svg'] = hashlib.sha256(path.read_bytes()).hexdigest()
            (project/'portrait-migration-report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError,'beyond layer names'):
                verify.verify_project(source,project,config)


if __name__ == '__main__': unittest.main()
