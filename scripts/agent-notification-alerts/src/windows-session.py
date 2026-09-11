"""Ctrl+Alt+F1/F2 bridge. No focus monitoring or third-party dependencies."""
import ctypes
from ctypes import wintypes
import json
import queue
import re
import sys
import threading
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
user32 = ctypes.WinDLL('user32', use_last_error=True)
shell32 = ctypes.WinDLL('shell32', use_last_error=True)
shell32.ShellExecuteW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.c_int]
shell32.ShellExecuteW.restype = ctypes.c_void_p
commands = queue.Queue()

def emit(value):
    print(json.dumps(value), flush=True)

def read_commands():
    for line in sys.stdin:
        try:
            if len(line) <= 8192:
                commands.put(json.loads(line))
        except ValueError:
            pass
    commands.put({'type': 'stop'})

def open_session(command):
    app, session = command.get('app'), command.get('id', '')
    if app == 'codex' and re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', session):
        url = 'codex://threads/' + session
    elif app == 'claude' and re.fullmatch(r'local_[A-Za-z0-9-]{1,64}', session):
        url = 'claude://code/continue?session=' + session
    elif app == 'claude' and re.fullmatch(r'(cse|session)_[A-Za-z0-9_-]{1,100}', session):
        url = 'claude://code/' + session
    else:
        raise ValueError('Unsupported desktop session ID')
    result = shell32.ShellExecuteW(None, 'open', url, None, None, 1)
    if not result or result <= 32:
        raise OSError('Windows could not open the session link: ' + str(result))
    emit({'type': 'opened', 'app': app, 'id': session})

def main():
    registered = []
    try:
        for number, key in [(1, 0x70), (2, 0x71)]:
            if user32.RegisterHotKey(None, number, 0x4003, key):
                registered.append(number)
            else:
                emit({'type': 'error', 'message': 'Ctrl+Alt+F' + str(number) + ' is unavailable.'})
        emit({'type': 'ready', 'hotkeys': registered})
        threading.Thread(target=read_commands, daemon=True).start()
        message = wintypes.MSG()
        while True:
            while user32.PeekMessageW(ctypes.byref(message), None, 0, 0, 1):
                if message.message == 0x0312:
                    emit({'type': 'hotkey', 'app': 'codex' if message.wParam == 1 else 'claude'})
            while not commands.empty():
                command = commands.get()
                if command.get('type') == 'stop':
                    return
                if command.get('type') == 'open':
                    try:
                        open_session(command)
                    except Exception as error:
                        emit({'type': 'error', 'message': str(error)})
            time.sleep(0.05)
    finally:
        for number in registered:
            user32.UnregisterHotKey(None, number)

if __name__ == '__main__':
    main()
