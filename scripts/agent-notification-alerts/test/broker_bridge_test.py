import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from broker_bridge import read_pending_alerts

class ReadPendingAlertsTests(unittest.TestCase):
    def test_missing_file_reads_as_no_alerts(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(read_pending_alerts(directory), [])

    def test_corrupt_file_reads_as_no_alerts_rather_than_raising(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'pending.json').write_text('not json', encoding='utf-8')
            self.assertEqual(read_pending_alerts(directory), [])

    def test_saved_entries_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            entries = [{'notificationId': 'a1', 'app': 'codex', 'alert': {'message': 'hi', 'category': 'done'}}]
            import json
            (Path(directory) / 'pending.json').write_text(json.dumps(entries), encoding='utf-8')
            self.assertEqual(read_pending_alerts(directory), entries)

if __name__ == '__main__':
    unittest.main()
