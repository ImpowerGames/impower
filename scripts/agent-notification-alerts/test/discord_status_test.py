import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from discord_status import discord_status_text

class DiscordStatusTextTests(unittest.TestCase):
    def test_unconfigured_points_at_the_environment_variable(self):
        self.assertEqual(discord_status_text(None), 'Set AGENT_ALERT_DISCORD_CLIENT_ID to enable.')

    def test_missing_status_file_while_configured_reads_as_not_yet_running(self):
        self.assertEqual(discord_status_text({}), 'Notifier not running.')

    def test_unauthorized_prompts_the_connect_action(self):
        self.assertEqual(discord_status_text({'phase': 'unauthorized'}), 'Not connected · click Connect Discord.')

    def test_connecting_phases_read_as_connecting(self):
        for phase in ('connecting', 'authorizing', 'authenticating'):
            self.assertEqual(discord_status_text({'phase': phase}), 'Connecting to Discord…')

    def test_in_call_takes_priority_over_ready(self):
        self.assertEqual(discord_status_text({'phase': 'ready', 'inCall': True}), 'Discord call detected.')

    def test_ready_without_a_call_is_quietly_connected(self):
        self.assertEqual(discord_status_text({'phase': 'ready', 'inCall': False}), 'Connected · not on a call.')

    def test_reported_error_is_shown_verbatim(self):
        self.assertEqual(discord_status_text({'phase': 'unavailable', 'error': 'Discord is not running.'}), 'Discord is not running.')

    def test_unavailable_without_a_reason_falls_back_to_a_generic_message(self):
        self.assertEqual(discord_status_text({'phase': 'unavailable', 'error': None}), 'Discord unavailable.')

if __name__ == '__main__':
    unittest.main()
