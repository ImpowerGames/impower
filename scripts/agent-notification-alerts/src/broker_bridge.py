"""Desktop-app access to pending alerts. Listing reads the broker's
persisted pending.json directly (safe with no broker running, and with no
side effect, matching the existing marker-file architecture). Dismissing an
alert instead goes through the existing Node CLI, since the running broker
is pending.json's only writer and a direct edit here would just be
overwritten on its next heartbeat."""
import json
import os
import subprocess
from pathlib import Path

def read_pending_alerts(state_dir):
    try:
        return json.loads((Path(state_dir) / 'pending.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []

def acknowledge_alert(state_dir, notification_id, app, timeout=20):
    """Returns True only once the broker confirms the alert is cleared."""
    main_script = Path(__file__).parent / 'main.mjs'
    env = {**os.environ, 'AGENT_ALERT_STATE_DIR': str(state_dir), 'AGENT_ALERT_APP': app}
    try:
        result = subprocess.run(
            ['node', str(main_script), 'acknowledge', notification_id],
            capture_output=True, text=True, timeout=timeout, env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        if result.returncode != 0:
            return False
        return bool(json.loads(result.stdout).get('acknowledged'))
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return False
