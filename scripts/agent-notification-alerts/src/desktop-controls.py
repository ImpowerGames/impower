"""Small local voice toggle. Uses the same state directory as the receiver."""
import argparse
import ctypes
import os
from pathlib import Path
from queue import SimpleQueue
from threading import Event, Thread
import tkinter as tk
from tkinter import messagebox
import pystray
from PIL import Image, ImageDraw, ImageTk

parser = argparse.ArgumentParser()
parser.add_argument('--state-dir', default=os.environ.get('AGENT_ALERT_STATE_DIR', str(Path.home() / '.agent-notification-alerts')))
args = parser.parse_args()
marker = Path(args.state_dir) / 'voice-muted'
lights_marker = Path(args.state_dir) / 'lights-muted'
all_marker = Path(args.state_dir) / 'all-muted'
commands = SimpleQueue()
tray_ready = Event()
last_muted = None

root = tk.Tk()
root.title('Agent Alerts')
root.geometry('480x560')
root.resizable(False, False)
root.configure(bg='#111318')

def style_titlebar():
    if os.name != 'nt':
        return
    from ctypes import wintypes
    user32 = ctypes.WinDLL('user32')
    user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
    user32.GetAncestor.restype = wintypes.HWND
    dwm = ctypes.WinDLL('dwmapi')
    dwm.DwmSetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
    dwm.DwmSetWindowAttribute.restype = ctypes.c_long
    window = user32.GetAncestor(root.winfo_id(), 2)
    enabled = ctypes.c_int(1)
    if dwm.DwmSetWindowAttribute(window, 20, ctypes.byref(enabled), ctypes.sizeof(enabled)) != 0:
        dwm.DwmSetWindowAttribute(window, 19, ctypes.byref(enabled), ctypes.sizeof(enabled))
    # Windows 11 caption/background colors are COLORREF (BGR).
    for attribute, color in [(35, 0x181311), (36, 0xf7f4f4)]:
        value = wintypes.DWORD(color)
        dwm.DwmSetWindowAttribute(window, attribute, ctypes.byref(value), ctypes.sizeof(value))

root.after(100, style_titlebar)
shell = tk.Frame(root, bg='#111318')
shell.pack(fill='both', expand=True, padx=28, pady=24)
tk.Label(shell, text='YOUR WORK, AT YOUR PACE', font=('Segoe UI', 9, 'bold'), fg='#a99ef5', bg='#111318', anchor='w').pack(fill='x')
tk.Label(shell, text='Agent Alerts', font=('Segoe UI', 25, 'bold'), fg='#f4f4f7', bg='#111318', anchor='w').pack(fill='x', pady=(5, 3))
tk.Label(shell, text='Choose how your agents get your attention.', font=('Segoe UI', 10), fg='#a4a7b2', bg='#111318', anchor='w').pack(fill='x')
status = tk.Label(shell, font=('Segoe UI', 10, 'bold'), bg='#111318', anchor='w')
status.pack(fill='x', pady=(18, 12))

def refresh():
    global last_muted
    paused = all_marker.exists()
    muted = marker.exists() or paused
    lights_off = lights_marker.exists() or paused
    status.config(text='●  Paused · enjoy the quiet' if paused else ('●  Alerts are off' if muted and lights_off else '●  Ready when your agents are'), fg='#eac889' if paused or (muted and lights_off) else '#91d5bc')
    button.config(text='Off' if muted else 'On', bg='#30333d' if muted else '#b8adff', fg='#bec1cc' if muted else '#191329')
    button.config(state='disabled' if paused else 'normal')
    lights_button.config(text='Off' if lights_off else 'On', bg='#30333d' if lights_off else '#b8adff', fg='#bec1cc' if lights_off else '#191329', state='disabled' if paused else 'normal')
    all_button.config(text='Resume alerts' if paused else 'Pause all alerts', bg='#b8adff' if paused else '#292633', fg='#191329' if paused else '#e2dafa')
    pause_hint.config(text='Your previous settings will be restored.' if paused else 'A little quiet for meetings or focused work.')
    state = (muted, lights_off, paused)
    if tray_ready.is_set() and state != last_muted:
        icon_image = tray_image(muted or lights_off)
        tray.icon = icon_image
        root.alert_icon = ImageTk.PhotoImage(icon_image)
        root.iconphoto(True, root.alert_icon)
        tray.title = 'Agent Alerts — ' + status.cget('text')
        tray.update_menu()
        last_muted = state

def toggle(target=marker):
    try:
        if target.exists():
            target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.touch()
        refresh()
    except OSError as error:
        messagebox.showerror('Could not change voice setting', str(error))

def channel_row(title, description, command):
    card = tk.Frame(shell, bg='#1d2028', padx=18, pady=15)
    card.pack(fill='x', pady=(0, 8))
    control = tk.Button(card, command=command, font=('Segoe UI', 11, 'bold'), relief='flat', borderwidth=0, width=6, pady=5, cursor='hand2', activebackground='#cec6ff', disabledforeground='#757987', takefocus=True)
    control.pack(side='right', padx=(12, 0))
    tk.Label(card, text=title, font=('Segoe UI', 12, 'bold'), fg='#f0f0f5', bg='#1d2028', anchor='w').pack(fill='x')
    tk.Label(card, text=description, font=('Segoe UI', 9), fg='#a4a7b2', bg='#1d2028', anchor='w').pack(fill='x', pady=(3, 0))
    return control

button = channel_row('Voice', 'Spoken updates from your agents', toggle)
lights_button = channel_row('Keyboard lights', 'A gentle flash when you’re needed', lambda: toggle(lights_marker))
all_button = tk.Button(shell, command=lambda: toggle(all_marker), font=('Segoe UI', 12, 'bold'), relief='flat', borderwidth=0, pady=12, cursor='hand2', activebackground='#cec6ff', takefocus=True)
all_button.pack(fill='x', pady=(10, 0))
pause_hint = tk.Label(shell, font=('Segoe UI', 9), fg='#a4a7b2', bg='#111318')
pause_hint.pack(pady=(7, 18))
tk.Frame(shell, height=1, bg='#2a2d36').pack(fill='x')
tk.Label(shell, text='Settings saved automatically · Shortcuts stay active\nClose or minimize to keep running in the tray.', font=('Segoe UI', 9), fg='#858997', bg='#111318', justify='left', anchor='w').pack(fill='x', pady=(12, 0))

def tray_image(muted):
    image = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((2, 2, 62, 62), radius=14, fill='#18212f')
    color = '#fbbf24' if muted else '#86efac'
    draw.polygon([(13, 25), (24, 25), (37, 15), (37, 49), (24, 39), (13, 39)], fill=color)
    if muted:
        draw.line((44, 26, 55, 38), fill=color, width=4)
        draw.line((55, 26, 44, 38), fill=color, width=4)
    else:
        draw.arc((30, 17, 55, 47), -65, 65, fill=color, width=4)
    return image

def show_window():
    root.deiconify()
    root.lift()
    root.focus_force()

def hide_window():
    # Never hide the only controls until the tray icon actually exists.
    if tray_ready.is_set():
        root.withdraw()

def quit_app():
    tray.stop()
    root.destroy()

def on_unmap(event):
    if event.widget == root and root.state() == 'iconic':
        hide_window()

initial_icon = tray_image(marker.exists() or lights_marker.exists() or all_marker.exists())
root.alert_icon = ImageTk.PhotoImage(initial_icon)
root.iconphoto(True, root.alert_icon)
tray = pystray.Icon('agent-alerts', initial_icon, 'Agent Alerts', menu=pystray.Menu(
    pystray.MenuItem('Open Agent Alerts', lambda: commands.put('open'), default=True),
    pystray.MenuItem(lambda item: 'Turn voice on' if marker.exists() else 'Mute voice', lambda: commands.put('toggle'), enabled=lambda item: not all_marker.exists()),
    pystray.MenuItem(lambda item: 'Turn lights on' if lights_marker.exists() else 'Turn lights off', lambda: commands.put('lights'), enabled=lambda item: not all_marker.exists()),
    pystray.MenuItem(lambda item: 'Resume alerts' if all_marker.exists() else 'Pause all alerts', lambda: commands.put('all')),
    pystray.Menu.SEPARATOR,
    pystray.MenuItem('Quit controls', lambda: commands.put('quit')),
))

def start_tray():
    def ready(icon):
        icon.visible = True
        tray_ready.set()
    try:
        tray.run(setup=ready)
    except Exception as error:
        commands.put(('error', str(error)))

root.bind('<Unmap>', on_unmap)
root.protocol('WM_DELETE_WINDOW', hide_window)
Thread(target=start_tray, daemon=True).start()

def poll():
    while not commands.empty():
        command = commands.get()
        if command == 'open':
            show_window()
        elif command == 'toggle':
            toggle()
        elif command == 'lights':
            toggle(lights_marker)
        elif command == 'all':
            toggle(all_marker)
        elif command == 'quit':
            quit_app()
            return
        elif isinstance(command, tuple):
            tray_ready.clear()
            show_window()
            root.protocol('WM_DELETE_WINDOW', root.destroy)
            messagebox.showerror('System tray unavailable', command[1])
    refresh()
    root.after(500, poll)

poll()
root.mainloop()
