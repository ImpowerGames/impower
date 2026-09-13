"""Shared persisted selection for the optional local English voices."""
import json
import os
from pathlib import Path
import tempfile

def available_voices(directory):
    import numpy as np
    with np.load(Path(directory) / 'voices-v1.0.bin', allow_pickle=False) as archive:
        return sorted(key for key in archive.files if key.startswith(('af_', 'am_', 'bf_', 'bm_')))

def read_voice(state_dir, default):
    try:
        value = json.loads((Path(state_dir) / 'voice.json').read_text(encoding='utf-8'))
        return value['voice'] if isinstance(value.get('voice'), str) else default
    except (OSError, ValueError, AttributeError):
        return default

def save_voice(state_dir, voice, choices):
    if voice not in choices:
        raise ValueError('Choose an installed voice')
    directory = Path(state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=directory, prefix='voice-', suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump({'voice': voice}, output)
        os.replace(temporary, directory / 'voice.json')
    finally:
        Path(temporary).unlink(missing_ok=True)

def voice_label(voice):
    accent = 'British' if voice[0] == 'b' else 'American'
    gender = 'Female' if voice[1] == 'f' else 'Male'
    return f'{voice[3:].replace("_", " ").title()} — {accent} {gender}'

def save_bindings(state_dir, bindings):
    if set(bindings) != {'codex', 'claude'} or any(type(value) is not int or not 1 <= value <= 12 for value in bindings.values()) or bindings['codex'] == bindings['claude']:
        raise ValueError('Choose different keys from F1 to F12 for Codex and Claude.')
    directory = Path(state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=directory, prefix='keys-', suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(bindings, output)
        os.replace(temporary, directory / 'key-bindings.json')
    finally:
        Path(temporary).unlink(missing_ok=True)
