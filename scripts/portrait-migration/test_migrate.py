"""Bounded migration tests; no project artwork or network required."""
import unittest
import json
from pathlib import Path
import tempfile
import migrate
import legacy


class MigrationTests(unittest.TestCase):
    def test_writes_typed_names_without_changing_artist_xml(self):
        source = '<svg xmlns="http://www.w3.org/2000/svg"><g id="filter-hat"><path fill="#abc" d="M0 0"/></g><g id="body"/></svg>'
        result = migrate.rewrite_svg(source, {'filter-hat': 'hat.on'})
        self.assertIn('id="body"', result)  # Positive control on old behavior.
        self.assertEqual(result, source.replace('id="filter-hat"', 'data-name="hat.on"'))

    def test_referenced_layer_ids_and_render_resources_are_preserved(self):
        source = '<svg id="art"><defs><clipPath id="clip"><path d="M0 0"/></clipPath><linearGradient id="paint"/></defs><g id="filter-hat" clip-path="url(#clip)" fill="url(#paint)"/><g id="filter-coat"/><use href="#filter-hat"/><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#filter-coat"/><g id="filter-glasses"/></svg>'
        result = migrate.rewrite_svg(source, {'filter-hat':'hat.on','filter-coat':'coat.on','filter-glasses':'glasses.on'})
        self.assertIn('id="filter-hat"',result)
        self.assertIn('id="filter-coat"',result)
        self.assertNotIn('id="filter-glasses"',result)
        self.assertIn('clip-path="url(#clip)" fill="url(#paint)"',result)
        self.assertIn('<svg id="art"><defs><clipPath id="clip">',result)

    def test_drawing_bytes_change_only_at_layer_id_and_name_attributes(self):
        source = '<svg id="art" xmlns:serif="http://www.serif.com/"><g  id = \'filter-hat\' data-name="old" serif:id="artist label" style="fill:#00ffaa"><path id="shape" d="M 0,0 L 4,5"/></g></svg>'
        result = migrate.rewrite_svg(source,{'filter-hat':'hat.on'})
        self.assertEqual(result,source.replace("  id = 'filter-hat'",'').replace('data-name="old"','data-name="hat.on"'))

    def test_existing_data_name_is_replaced_once(self):
        source = '<svg><g data-name="old" id="filter-eyes"/></svg>'
        result = migrate.rewrite_svg(source, {'filter-eyes': 'pupils:eyes.open:look.left'})
        self.assertEqual(result.count('data-name='), 1)
        self.assertIn('data-name="pupils:eyes.open:look.left"', result)

    def test_duplicate_ids_are_rejected_before_migration(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            migrate.rewrite_svg('<svg><g id="same"/><g id="same"/></svg>', {'same': 'hat.on'})

    def test_comments_and_namespace_metadata_are_not_rewritten(self):
        source = '<svg xmlns:serif="http://www.serif.com/"><!-- <g id="filter-hat"/> --><g serif:id="typed hat" id="filter-hat"/></svg>'
        result = migrate.rewrite_svg(source, {'filter-hat':'hat.on'})
        self.assertIn('<!-- <g id="filter-hat"/> -->', result)
        self.assertIn('serif:id="typed hat"', result)
        self.assertEqual(result.count('data-name='), 1)

    def test_legacy_oracle_respects_excludes_and_parent_visibility(self):
        tree = legacy.Node('root', [legacy.Node('filter-face-happy', [legacy.Node('filter-mouth-default', [])])])
        self.assertEqual(legacy.old_visible(tree, {'includes':['face-happy'], 'excludes':[]}), {'filter-face-happy','filter-mouth-default'})
        self.assertEqual(legacy.old_visible(tree, {'includes':['face-happy'], 'excludes':['face-happy']}), set())

    def test_all_historical_exceptions_assert_exact_layer_changes(self):
        config = json.loads((Path(__file__).parent/'raffles-and-bunny.json').read_text())
        exceptions = config['historical_exceptions']
        self.assertEqual(len(exceptions), 27)
        self.assertEqual(exceptions['bunny_assertive~phone_hold_right~look_down']['added'], [])
        self.assertEqual(len(exceptions['bunny_assertive~phone_hold_right~look_down']['removed']),4)
        self.assertEqual(migrate.expected_set({'a','b'}, {'removed':['b'], 'added':['c']}), {'a','c'})

    def test_later_wins_order_is_not_destroyed_by_deduplication(self):
        self.assertEqual(migrate.compact(['face.happy','face.sad','face.happy']), ['face.happy','face.sad','face.happy'])

    def test_project_conversion_runs_production_core_and_preserves_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root/'input', root/'output'
            (source/'assets').mkdir(parents=True)
            (source/'scripts').mkdir()
            main = '[[mia~face_happy]]\n[[mia_party]]\n[[mia_missing~face_happy]]\n'
            (source/'main.sd').write_text(main)
            (source/'assets/mia.svg').write_text('<svg><g id="filter-face-neutral-default"/><g id="filter-face-happy"/></svg>')
            (source/'scripts/portraits.sd').write_text('define face_happy as filter with\n includes = { "face-happy" }\n excludes = { "face-(?!happy)" }\nend\ndefine mia_party as filtered_image with\n image = mia\n filters = { face_happy }\nend\n')
            config = json.loads((Path(__file__).parent/'raffles-and-bunny.json').read_text())
            config.update(clothes_filters={},phone_filters={},historical_exceptions={},portrait_prefixes=['mia_'])
            report = migrate.migrate(source,output,config)
            self.assertEqual(report['failures'],[])
            self.assertEqual((source/'main.sd').read_text(),main)
            self.assertEqual((output/'main.sd').read_text(),'[[mia:happy]]\n[[mia_party]]\n[[mia_missing:face.happy]]\n')
            self.assertEqual(report['missingImageDirectives']['mia_missing~face_happy']['uses'],1)
            self.assertIn('attributes = { "happy" }',(output/'scripts/portraits.sd').read_text())
            self.assertNotIn(' as filter with',(output/'scripts/portraits.sd').read_text())
            # Identical reruns are allowed; unrelated edits are never overwritten.
            migrate.migrate(source,output,config)
            (output/'scripts/portraits.sd').write_text('unrelated edit')
            with self.assertRaisesRegex(ValueError,'unrelated output changes'):
                migrate.migrate(source,output,config)
            self.assertEqual((output/'scripts/portraits.sd').read_text(),'unrelated edit')


if __name__ == '__main__':
    unittest.main()
