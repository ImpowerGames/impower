import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from voice_settings import read_voice, save_voice, voice_label, save_bindings

class VoiceSelectionTests(unittest.TestCase):
    def test_key_bindings_reject_conflicts_and_preserve_saved_choice(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            save_bindings(directory, {'codex': 8, 'claude': 9})
            for invalid in [{'codex': 8, 'claude': 8}, {'codex': 0, 'claude': 13}, {'codex': True, 'claude': 2}]:
                with self.assertRaises(ValueError):
                    save_bindings(directory, invalid)
            self.assertEqual(json.loads((Path(directory) / 'key-bindings.json').read_text()), {'codex': 8, 'claude': 9})

    def test_selection_persists_and_invalid_values_do_not_replace_it(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(read_voice(directory, 'bm_lewis'), 'bm_lewis')
            save_voice(directory, 'am_michael', ['bm_lewis', 'am_michael'])
            self.assertEqual(read_voice(directory, 'bm_lewis'), 'am_michael')
            with self.assertRaises(ValueError):
                save_voice(directory, 'missing', ['bm_lewis', 'am_michael'])
            self.assertEqual(read_voice(directory, 'bm_lewis'), 'am_michael')
            self.assertEqual(voice_label('bm_lewis'), 'Lewis — British Male')
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_corrupt_settings_fall_back(self):
        with tempfile.TemporaryDirectory() as directory:
            for value in ['broken', 'null', '[]', '{"voice": 42}']:
                (Path(directory) / 'voice.json').write_text(value)
                self.assertEqual(read_voice(directory, 'bm_lewis'), 'bm_lewis')

if __name__ == '__main__':
    unittest.main()
