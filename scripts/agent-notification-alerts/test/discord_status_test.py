import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from discord_status import discord_status_text, read_discord_credentials, save_discord_credentials

class DiscordStatusTextTests(unittest.TestCase):
    def test_unconfigured_points_at_the_setup_options(self):
        self.assertEqual(discord_status_text(None), 'Enter a Discord application above, or set AGENT_ALERT_DISCORD_CLIENT_ID, to enable.')

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

class DiscordCredentialsTests(unittest.TestCase):
    def test_missing_credentials_file_reads_as_none(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(read_discord_credentials(directory))

    def test_save_then_read_reports_the_id_and_that_a_secret_is_stored_without_exposing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            save_discord_credentials(directory, ' my-client-id ', ' my-secret ')
            self.assertEqual(read_discord_credentials(directory), {'clientId': 'my-client-id', 'hasSecret': True})
            import json
            self.assertEqual(json.loads((Path(directory) / 'discord-credentials.json').read_text())['clientSecret'], 'my-secret')

    def test_blank_client_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                save_discord_credentials(directory, '   ', 'secret')
            self.assertIsNone(read_discord_credentials(directory))

    def test_resaving_with_a_blank_secret_keeps_the_previous_one(self):
        with tempfile.TemporaryDirectory() as directory:
            save_discord_credentials(directory, 'client-a', 'first-secret')
            save_discord_credentials(directory, 'client-b', '')
            import json
            saved = json.loads((Path(directory) / 'discord-credentials.json').read_text())
            self.assertEqual(saved, {'clientId': 'client-b', 'clientSecret': 'first-secret'})

    def test_first_save_with_a_blank_secret_falls_back_to_the_environment_variable(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = os.environ.get('AGENT_ALERT_DISCORD_CLIENT_SECRET')
            os.environ['AGENT_ALERT_DISCORD_CLIENT_SECRET'] = 'env-secret'
            try:
                # No discord-credentials.json exists yet: a blank secret here
                # must not silently write an empty one over an env-configured
                # secret the user already relies on.
                save_discord_credentials(directory, 'client-a', '')
                saved = json.loads((Path(directory) / 'discord-credentials.json').read_text())
                self.assertEqual(saved, {'clientId': 'client-a', 'clientSecret': 'env-secret'})
            finally:
                if previous is None:
                    os.environ.pop('AGENT_ALERT_DISCORD_CLIENT_SECRET', None)
                else:
                    os.environ['AGENT_ALERT_DISCORD_CLIENT_SECRET'] = previous

    def test_no_stray_temp_file_is_left_behind(self):
        with tempfile.TemporaryDirectory() as directory:
            save_discord_credentials(directory, 'client', 'secret')
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

if __name__ == '__main__':
    unittest.main()
