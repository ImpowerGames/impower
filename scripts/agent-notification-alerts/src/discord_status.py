"""Status text and file reading for the desktop app's Discord calls card."""
import json
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

def discord_status_text(status):
    if status is None:
        return 'Set AGENT_ALERT_DISCORD_CLIENT_ID to enable.'
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
