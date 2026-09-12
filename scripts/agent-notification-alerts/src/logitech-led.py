"""Logitech LED SDK adapter. Receives complete pending key sets over stdin."""
import ctypes
import json
import os
import queue
import sys
import threading
import time

def emit(status):
    print(json.dumps({'status': status}), flush=True)

def key_name(hid):
    if 58 <= hid <= 67:
        return hid + 1
    if hid in (68, 69):
        return hid + 19
    raise ValueError('Logitech alert lighting currently supports F1-F12 only')

def validate_keys(value):
    result = {}
    for item in value:
        hid = item['hid']
        if type(hid) is not int:
            raise ValueError('Invalid key')
        key_name(hid)
        color = item['color']
        if len(color) != 3 or any(type(c) is not int or not 0 <= c <= 255 for c in color):
            raise ValueError('Invalid RGB color')
        result[hid] = [round(c * 100 / 255) for c in color]
    return result

def main():
    dll_path = os.environ.get('AGENT_ALERT_LOGITECH_DLL', '')
    if not os.path.isabs(dll_path):
        raise ValueError('Set AGENT_ALERT_LOGITECH_DLL to the official Logitech SDK DLL')
    dll = ctypes.CDLL(dll_path)
    signatures = {
        'LogiLedInitWithName': [ctypes.c_char_p],
        'LogiLedSetTargetDevice': [ctypes.c_int],
        'LogiLedSaveLightingForKey': [ctypes.c_int],
        'LogiLedRestoreLightingForKey': [ctypes.c_int],
        'LogiLedSetLightingForKeyWithHidCode': [ctypes.c_int] * 4,
    }
    for name, args in signatures.items():
        fn = getattr(dll, name)
        fn.argtypes = args
        fn.restype = ctypes.c_bool
    dll.LogiLedShutdown.argtypes = []
    dll.LogiLedShutdown.restype = None
    commands = queue.Queue()
    def read_commands():
        for line in sys.stdin:
            try:
                if len(line) <= 8192:
                    commands.put(validate_keys(json.loads(line)))
            except Exception as error:
                emit(str(error))
        commands.put(None)
    threading.Thread(target=read_commands, daemon=True).start()
    desired, saved = {}, set()
    active, phase, retry_at = False, False, 0
    last_status = None
    def report(value):
        nonlocal last_status
        if value != last_status:
            emit(value)
            last_status = value
    try:
        while True:
            try:
                command = commands.get(timeout=0.5)
                if command is None:
                    break
                desired = command
            except queue.Empty:
                pass
            if not desired:
                if active:
                    for hid in saved:
                        dll.LogiLedRestoreLightingForKey(key_name(hid))
                    dll.LogiLedShutdown()
                    saved.clear()
                    active = False
                report('idle')
                continue
            if not active:
                if time.monotonic() < retry_at:
                    continue
                retry_at = time.monotonic() + 5
                if not dll.LogiLedInitWithName(b'Agent Notification Alerts'):
                    dll.LogiLedShutdown()
                    report('Logitech SDK unavailable. Start G HUB and enable application lighting control.')
                    continue
                active = True
                time.sleep(0.2)
                if not dll.LogiLedSetTargetDevice(4):
                    raise RuntimeError('Logitech per-key RGB target was rejected')
            for hid in saved - desired.keys():
                if not dll.LogiLedRestoreLightingForKey(key_name(hid)):
                    raise RuntimeError('Logitech could not restore a key')
            saved.intersection_update(desired)
            for hid in desired.keys() - saved:
                if not dll.LogiLedSaveLightingForKey(key_name(hid)):
                    raise RuntimeError('Logitech could not save the key lighting')
                saved.add(hid)
            phase = not phase
            for hid, color in desired.items():
                if not dll.LogiLedSetLightingForKeyWithHidCode(hid, *(color if phase else [0, 0, 0])):
                    raise RuntimeError('Logitech rejected per-key lighting. Check G HUB, device connection and lighting permissions.')
            report('lighting commands accepted; visual confirmation required')
    finally:
        if active:
            for hid in saved:
                dll.LogiLedRestoreLightingForKey(key_name(hid))
            dll.LogiLedShutdown()

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit(str(error))
        sys.exit(1)
