"""Status text and file reading for the desktop app's Discord calls card."""
import json
import os
import tempfile
import time
from pathlib import Path

def read_discord_status(state_dir):
    """Reads the broker's discord-status.json. None means it has never been
    written (Discord integration not configured or never started); an empty
    dict means the file is stale or unreadable, which reads the same as the
    broker not currently running."""
    path = Path(state_dir) / 'discord-status.json'
    try:
        text = path.read_text(encoding='utf-8')
        mtime = path.stat().st_mtime
    except OSError:
        return None
    if time.time() - mtime > 5:
        return {}
    try:
        return json.loads(text)
    except ValueError:
        return {}

def read_discord_credentials(state_dir):
    """Reads the saved client ID and whether a secret is stored, never the
    secret itself, so the desktop app never has to redisplay it."""
    path = Path(state_dir) / 'discord-credentials.json'
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        return {'clientId': data.get('clientId', ''), 'hasSecret': bool(data.get('clientSecret'))}
    except (OSError, ValueError):
        return None

def save_discord_credentials(state_dir, client_id, client_secret):
    """Saves the client ID and secret atomically. A blank secret keeps the
    previously saved one, so re-saving just the client ID never clears it."""
    client_id = client_id.strip()
    if not client_id:
        raise ValueError('Enter a Discord application client ID.')
    directory = Path(state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'discord-credentials.json'
    client_secret = client_secret.strip()
    if not client_secret:
        try:
            client_secret = json.loads(target.read_text(encoding='utf-8')).get('clientSecret', '')
        except (OSError, ValueError):
            client_secret = ''
    descriptor, temporary = tempfile.mkstemp(dir=directory, prefix='discord-credentials-', suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump({'clientId': client_id, 'clientSecret': client_secret}, output)
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)

def discord_status_text(status):
    if status is None:
        return 'Enter a Discord application above, or set AGENT_ALERT_DISCORD_CLIENT_ID, to enable.'
    phase = status.get('phase')
    if phase is None:
        return 'Notifier not running.'
    if phase == 'unauthorized':
        return 'Not connected · click Connect Discord.'
    if phase in ('connecting', 'authorizing', 'authenticating'):
        return 'Connecting to Discord…'
    if status.get('inCall'):
        return 'Discord call detected.'
    if phase == 'ready':
        return 'Connected · not on a call.'
    return status.get('error') or 'Discord unavailable.'
