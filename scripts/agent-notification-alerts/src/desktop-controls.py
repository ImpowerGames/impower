"""Small local voice toggle. Uses the same state directory as the receiver."""
import argparse
import ctypes
import json
import os
import time
from pathlib import Path
from queue import SimpleQueue
from threading import Event, Thread
import tkinter as tk
from tkinter import messagebox, ttk
from broker_bridge import acknowledge_alert, read_pending_alerts
from discord_status import discord_status_text, read_discord_credentials, read_discord_status, save_discord_credentials
from voice_settings import available_voices, read_voice, save_voice, voice_label
import pystray
from PIL import Image, ImageDraw, ImageTk

parser = argparse.ArgumentParser()
parser.add_argument('--state-dir', default=os.environ.get('AGENT_ALERT_STATE_DIR', str(Path.home() / '.agent-notification-alerts')))
parser.add_argument('--kokoro-dir', default=os.environ.get('AGENT_ALERT_KOKORO_DIR'))
parser.add_argument('--config', default=os.environ.get('AGENT_ALERT_CONFIG'))
args = parser.parse_args()
marker = Path(args.state_dir) / 'voice-muted'
lights_marker = Path(args.state_dir) / 'lights-muted'
all_marker = Path(args.state_dir) / 'all-muted'
discord_disabled_marker = Path(args.state_dir) / 'discord-mute-disabled'
discord_call_marker = Path(args.state_dir) / 'discord-call-muted'
discord_connect_marker = Path(args.state_dir) / 'discord-connect-request'
commands = SimpleQueue()
tray_ready = Event()
last_muted = None

root = tk.Tk()
root.title('Agent Alerts')
root.geometry('480x820')
root.minsize(480, 360)
root.resizable(False, True)
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

# A plain fixed-height frame clipped whatever grew past the window's bottom
# edge (the Discord card's added fields did). Scrolling keeps the window
# usable at any height instead of guessing a tall-enough fixed size.
style = ttk.Style(root)
style.theme_use('clam')
style.configure('Dark.Vertical.TScrollbar', gripcount=0, background='#30333d', darkcolor='#30333d', lightcolor='#30333d', troughcolor='#111318', bordercolor='#111318', arrowcolor='#a4a7b2', relief='flat')
style.map('Dark.Vertical.TScrollbar', background=[('active', '#3a3d47'), ('pressed', '#49405e')])

scroll_container = tk.Frame(root, bg='#111318')
scroll_container.pack(fill='both', expand=True)
canvas = tk.Canvas(scroll_container, bg='#111318', highlightthickness=0)
scrollbar = ttk.Scrollbar(scroll_container, orient='vertical', command=canvas.yview, style='Dark.Vertical.TScrollbar')
canvas.configure(yscrollcommand=scrollbar.set)
canvas.pack(side='left', fill='both', expand=True)
scrollbar.pack(side='right', fill='y')

shell = tk.Frame(canvas, bg='#111318')
shell_window = canvas.create_window((28, 16), window=shell, anchor='nw')

def _fit_shell_to_canvas(event=None):
    canvas.configure(scrollregion=(0, 0, 0, canvas.bbox('all')[3] + 16 if canvas.bbox('all') else 0))
    canvas.itemconfig(shell_window, width=max(1, canvas.winfo_width() - 56))

shell.bind('<Configure>', _fit_shell_to_canvas)
canvas.bind('<Configure>', _fit_shell_to_canvas)

def _on_mousewheel(event):
    canvas.yview_scroll(int(-1 * (event.delta / 120)), 'units')

# Scoped to while the pointer is over this window, so it never fights a
# combobox dropdown's own scrolling elsewhere.
canvas.bind('<Enter>', lambda event: canvas.bind_all('<MouseWheel>', _on_mousewheel))
canvas.bind('<Leave>', lambda event: canvas.unbind_all('<MouseWheel>'))
tk.Label(shell, text='YOUR WORK, AT YOUR PACE', font=('Segoe UI', 9, 'bold'), fg='#a99ef5', bg='#111318', anchor='w').pack(fill='x')
tk.Label(shell, text='Agent Alerts', font=('Segoe UI', 25, 'bold'), fg='#f4f4f7', bg='#111318', anchor='w').pack(fill='x', pady=(5, 3))
tk.Label(shell, text='Choose how your agents get your attention.', font=('Segoe UI', 10), fg='#a4a7b2', bg='#111318', anchor='w').pack(fill='x')
status = tk.Label(shell, font=('Segoe UI', 10, 'bold'), bg='#111318', anchor='w')
status.pack(fill='x', pady=(12, 10))

alerts_header = tk.Frame(shell, bg='#111318')
alerts_header.pack(fill='x')
tk.Label(alerts_header, text='ACTIVE ALERTS', font=('Segoe UI', 9, 'bold'), fg='#a99ef5', bg='#111318', anchor='w').pack(side='left')
dismiss_all_button = tk.Button(alerts_header, text='Dismiss all', font=('Segoe UI', 8, 'bold'), bg='#292633', fg='#e2dafa', relief='flat', padx=8, pady=2, cursor='hand2', state='disabled')
dismiss_all_button.pack(side='right')
alerts_list = tk.Frame(shell, bg='#111318')
alerts_list.pack(fill='x', pady=(6, 6))
CATEGORY_COLORS = {'done': '#41d67c', 'user_input_needed': '#eac889', 'blocked': '#f4726b'}
# None, never a real list, so the first render_alerts([]) call (below) is
# never mistaken for "unchanged from last time" and actually draws once.
current_alerts = None

def render_alerts(alerts):
    global current_alerts
    if alerts == current_alerts:
        return
    current_alerts = alerts
    for child in alerts_list.winfo_children():
        child.destroy()
    if not alerts:
        tk.Label(alerts_list, text='No active alerts.', font=('Segoe UI', 9), fg='#a4a7b2', bg='#111318', anchor='w').pack(fill='x')
        dismiss_all_button.config(state='disabled')
        return
    dismiss_all_button.config(state='normal')
    for entry in alerts:
        row = tk.Frame(alerts_list, bg='#1d2028', padx=14, pady=10)
        row.pack(fill='x', pady=(0, 6))
        header = tk.Frame(row, bg='#1d2028')
        header.pack(fill='x')
        color = CATEGORY_COLORS.get(entry.get('alert', {}).get('category'), '#a4a7b2')
        tk.Label(header, text='●', font=('Segoe UI', 10), fg=color, bg='#1d2028').pack(side='left')
        tk.Label(header, text=entry.get('app', 'other').title(), font=('Segoe UI', 9, 'bold'), fg='#f0f0f5', bg='#1d2028').pack(side='left', padx=(6, 0))
        tk.Button(header, text='Dismiss', command=lambda entry=entry: dismiss_one_alert(entry), font=('Segoe UI', 8, 'bold'), bg='#30333d', fg='#f0f0f5', relief='flat', padx=8, pady=2, cursor='hand2').pack(side='right')
        tk.Label(row, text=entry.get('alert', {}).get('message', ''), font=('Segoe UI', 9), fg='#d8d8de', bg='#1d2028', anchor='w', justify='left', wraplength=380).pack(fill='x', pady=(5, 0))

def dismiss_one_alert(entry):
    # Off the main thread: a slow or auto-spawning broker must not freeze
    # the window. render_alerts only ever runs back on the main thread, via
    # the same thread-safe queue the alert-list poller already uses.
    def worker():
        acknowledge_alert(args.state_dir, entry['notificationId'], entry.get('app', 'other'))
        commands.put(('alerts', read_pending_alerts(args.state_dir)))
    Thread(target=worker, daemon=True).start()

def dismiss_all_alerts():
    entries = list(current_alerts)
    def worker():
        for entry in entries:
            acknowledge_alert(args.state_dir, entry['notificationId'], entry.get('app', 'other'))
        commands.put(('alerts', read_pending_alerts(args.state_dir)))
    Thread(target=worker, daemon=True).start()

dismiss_all_button.config(command=dismiss_all_alerts)
render_alerts([])

def poll_alerts_loop():
    while True:
        commands.put(('alerts', read_pending_alerts(args.state_dir)))
        time.sleep(2)

def refresh():
    global last_muted
    paused = all_marker.exists()
    discord_muting = discord_call_marker.exists()
    muted = marker.exists() or paused or discord_muting
    lights_off = lights_marker.exists() or paused
    discord_off = discord_disabled_marker.exists() or paused
    if paused:
        status_text = '●  Paused · enjoy the quiet'
    elif muted and lights_off:
        status_text = '●  Alerts are off'
    elif discord_muting:
        status_text = '●  Voice muted · Discord call'
    else:
        status_text = '●  Ready when your agents are'
    status.config(text=status_text, fg='#eac889' if paused or (muted and lights_off) or discord_muting else '#91d5bc')
    button.config(text='Off' if muted else 'On', bg='#30333d' if muted else '#b8adff', fg='#bec1cc' if muted else '#191329')
    button.config(state='disabled' if paused else 'normal')
    lights_button.config(text='Off' if lights_off else 'On', bg='#30333d' if lights_off else '#b8adff', fg='#bec1cc' if lights_off else '#191329', state='disabled' if paused else 'normal')
    discord_button.config(text='Off' if discord_off else 'On', bg='#30333d' if discord_off else '#b8adff', fg='#bec1cc' if discord_off else '#191329', state='disabled' if paused else 'normal')
    discord_report = read_discord_status(args.state_dir)
    discord_status_label.config(text=discord_status_text(discord_report))
    # Show the button whenever a connection isn't already established or in
    # progress — including when nothing is configured yet, so there is
    # always a visible next step rather than an empty card.
    if (discord_report or {}).get('phase') not in ('ready', 'connecting', 'authorizing', 'authenticating'):
        discord_connect_button.pack(anchor='e', pady=(6, 0))
    else:
        discord_connect_button.pack_forget()
    all_button.config(text='Resume alerts' if paused else 'Pause all alerts', bg='#b8adff' if paused else '#292633', fg='#191329' if paused else '#e2dafa')
    pause_hint.config(text='Your previous settings will be restored.' if paused else 'A little quiet for meetings or focused work.')
    state = (muted, lights_off, paused, discord_off, discord_muting)
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
    header = tk.Frame(card, bg='#1d2028')
    header.pack(fill='x')
    control = tk.Button(header, command=command, font=('Segoe UI', 11, 'bold'), relief='flat', borderwidth=0, width=6, pady=5, cursor='hand2', activebackground='#cec6ff', disabledforeground='#757987', takefocus=True)
    control.pack(side='right', padx=(12, 0))
    tk.Label(header, text=title, font=('Segoe UI', 12, 'bold'), fg='#f0f0f5', bg='#1d2028', anchor='w').pack(fill='x')
    tk.Label(header, text=description, font=('Segoe UI', 9), fg='#a4a7b2', bg='#1d2028', anchor='w').pack(fill='x', pady=(3, 0))
    return control

button = channel_row('Voice', 'Spoken updates from your agents', toggle)
voice_card = tk.Frame(button.master.master, bg='#1d2028')
voice_card.pack(fill='x', pady=(12, 0))
tk.Label(voice_card, text='LOCAL VOICE', font=('Segoe UI', 9, 'bold'), fg='#a4a7b2', bg='#1d2028', anchor='w').pack(fill='x', pady=(0, 6))
voice_choices = []
try:
    if args.kokoro_dir:
        voice_choices = available_voices(args.kokoro_dir)
except (OSError, ValueError, ImportError):
    pass
voice_labels = {voice_label(voice): voice for voice in voice_choices}
style.configure('Voice.TCombobox', fieldbackground='#1d2028', background='#30333d', foreground='#f0f0f5', arrowcolor='#b8adff', padding=7)
style.map('Voice.TCombobox', fieldbackground=[('readonly', '#1d2028')], foreground=[('readonly', '#f0f0f5')], selectbackground=[('readonly', '#1d2028')], selectforeground=[('readonly', '#f0f0f5')])
root.option_add('*TCombobox*Listbox.background', '#1d2028')
root.option_add('*TCombobox*Listbox.foreground', '#f0f0f5')
root.option_add('*TCombobox*Listbox.selectBackground', '#49405e')
voice_picker = ttk.Combobox(voice_card, values=list(voice_labels), state='readonly' if voice_choices else 'disabled', style='Voice.TCombobox', font=('Segoe UI', 10), height=10)
voice_picker.pack(fill='x')
initial_voice = read_voice(args.state_dir, os.environ.get('AGENT_ALERT_KOKORO_VOICE', 'bm_lewis'))
voice_picker.set(voice_label(initial_voice) if initial_voice in voice_choices else 'Local voice unavailable')

def select_voice(event=None):
    try:
        save_voice(args.state_dir, voice_labels[voice_picker.get()], voice_choices)
    except (OSError, ValueError, KeyError) as error:
        messagebox.showerror('Could not save voice', str(error))

voice_picker.bind('<<ComboboxSelected>>', select_voice)
lights_button = channel_row('Keyboard lights', 'A gentle flash when you’re needed', lambda: toggle(lights_marker))
key_card = tk.Frame(lights_button.master.master, bg='#1d2028')
key_card.pack(fill='x', pady=(12, 0))
key_defaults = {'codex': 1, 'claude': 2}
shortcut_prefix = 'Ctrl+Alt+'
try:
    if args.config:
        local_config = json.loads(Path(args.config).read_text(encoding='utf-8'))
        key_defaults = local_config.get('shortcuts', key_defaults)
        if local_config.get('shortcutModifiers') == 'ctrl-shift':
            shortcut_prefix = 'Ctrl+Shift+'
    saved_keys = Path(args.state_dir) / 'key-bindings.json'
    if saved_keys.exists():
        key_defaults = json.loads(saved_keys.read_text(encoding='utf-8'))
except (OSError, ValueError):
    pass
key_pickers = {}
for app in ('codex', 'claude'):
    row = tk.Frame(key_card, bg='#1d2028')
    row.pack(fill='x', pady=3)
    tk.Label(row, text=app.title(), width=9, anchor='w', font=('Segoe UI', 10), fg='#f0f0f5', bg='#1d2028').pack(side='left')
    tk.Label(row, text=shortcut_prefix, font=('Segoe UI', 9), fg='#a4a7b2', bg='#1d2028').pack(side='left', padx=(0, 8))
    picker = ttk.Combobox(row, values=[f'F{i}' for i in range(1, 13)], state='readonly', style='Voice.TCombobox', width=5, font=('Segoe UI', 10))
    picker.set(f'F{key_defaults.get(app, 1 if app == "codex" else 2)}')
    picker.pack(side='left')
    key_pickers[app] = picker

def apply_keys():
    try:
        from voice_settings import save_bindings
        save_bindings(args.state_dir, {app: int(picker.get()[1:]) for app, picker in key_pickers.items()})
        keys_hint.config(text='Saved · applies to lights and shortcuts')
    except (OSError, ValueError) as error:
        messagebox.showerror('Could not save keys', str(error))

tk.Button(key_card, text='Apply keys', command=apply_keys, font=('Segoe UI', 9, 'bold'), bg='#30333d', fg='#f0f0f5', relief='flat', padx=12, pady=5).pack(anchor='e', pady=(5, 0))
keys_hint = tk.Label(key_card, text='Choose a different function key for each agent.', font=('Segoe UI', 8), fg='#a4a7b2', bg='#1d2028', anchor='w')
keys_hint.pack(fill='x', pady=(5, 0))

discord_button = channel_row('Mute voice during Discord calls', 'Automatically silences spoken alerts while you are connected to a Discord voice channel', lambda: toggle(discord_disabled_marker))
discord_card = tk.Frame(discord_button.master.master, bg='#1d2028')
discord_card.pack(fill='x', pady=(12, 0))

tk.Label(discord_card, text='DISCORD APPLICATION', font=('Segoe UI', 9, 'bold'), fg='#a4a7b2', bg='#1d2028', anchor='w').pack(fill='x', pady=(0, 6))
discord_id_var = tk.StringVar()
discord_secret_var = tk.StringVar()
_saved_discord_credentials = read_discord_credentials(args.state_dir)
if _saved_discord_credentials:
    discord_id_var.set(_saved_discord_credentials.get('clientId', ''))

def _discord_field_row(label_text, variable, mask=False):
    row = tk.Frame(discord_card, bg='#1d2028')
    row.pack(fill='x', pady=2)
    tk.Label(row, text=label_text, width=11, anchor='w', font=('Segoe UI', 9), fg='#f0f0f5', bg='#1d2028').pack(side='left')
    entry = tk.Entry(row, textvariable=variable, font=('Segoe UI', 10), bg='#292b33', fg='#f0f0f5', insertbackground='#f0f0f5', relief='flat', show='*' if mask else '')
    entry.pack(side='left', fill='x', expand=True, ipady=3)
    return entry

_discord_field_row('Client ID', discord_id_var)
_discord_field_row('Client secret', discord_secret_var, mask=True)

discord_credentials_hint = tk.Label(
    discord_card,
    text=('A secret is already saved · leave blank to keep it.' if _saved_discord_credentials and _saved_discord_credentials.get('hasSecret') else 'From discord.com/developers/applications — add http://localhost under its OAuth2 Redirects first.'),
    font=('Segoe UI', 8), fg='#858997', bg='#1d2028', justify='left', anchor='w', wraplength=380,
)
discord_credentials_hint.pack(fill='x', pady=(4, 0))

def save_discord_credentials_clicked():
    try:
        save_discord_credentials(args.state_dir, discord_id_var.get(), discord_secret_var.get())
        discord_secret_var.set('')
        discord_credentials_hint.config(text='Saved · the notifier picks this up within a second.')
    except (OSError, ValueError) as error:
        messagebox.showerror('Could not save Discord credentials', str(error))

tk.Button(discord_card, text='Save credentials', command=save_discord_credentials_clicked, font=('Segoe UI', 9, 'bold'), bg='#30333d', fg='#f0f0f5', relief='flat', padx=12, pady=5).pack(anchor='e', pady=(6, 0))

discord_status_label = tk.Label(discord_card, font=('Segoe UI', 9), fg='#a4a7b2', bg='#1d2028', anchor='w')
discord_status_label.pack(fill='x', pady=(10, 0))

def request_discord_connect():
    if read_discord_status(args.state_dir) is None:
        messagebox.showinfo(
            'Discord is not set up yet',
            'Enter your Discord application’s client ID and secret above and click '
            'Save credentials, then start (or restart) the notifier. Come back and click '
            'Connect Discord once it is running.',
        )
        return
    try:
        discord_connect_marker.parent.mkdir(parents=True, exist_ok=True)
        discord_connect_marker.touch()
        discord_status_label.config(text='Requested · approve the prompt in Discord…')
    except OSError as error:
        messagebox.showerror('Could not request Discord connection', str(error))

discord_connect_button = tk.Button(discord_card, text='Connect Discord', command=request_discord_connect, font=('Segoe UI', 9, 'bold'), bg='#30333d', fg='#f0f0f5', relief='flat', padx=12, pady=5)
discord_connect_button.pack(anchor='e', pady=(6, 0))

all_button = tk.Button(shell, command=lambda: toggle(all_marker), font=('Segoe UI', 12, 'bold'), relief='flat', borderwidth=0, pady=12, cursor='hand2', activebackground='#cec6ff', takefocus=True)
all_button.pack(fill='x', pady=(10, 0))
pause_hint = tk.Label(shell, font=('Segoe UI', 9), fg='#a4a7b2', bg='#111318')
pause_hint.pack(pady=(7, 10))
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

initial_icon = tray_image(marker.exists() or lights_marker.exists() or all_marker.exists() or discord_call_marker.exists())
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
root.bind('<Map>', lambda event: root.after(150, style_titlebar) if event.widget == root else None)
root.protocol('WM_DELETE_WINDOW', hide_window)
Thread(target=start_tray, daemon=True).start()
Thread(target=poll_alerts_loop, daemon=True).start()

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
        elif isinstance(command, tuple) and command[0] == 'alerts':
            render_alerts(command[1])
        elif isinstance(command, tuple):
            tray_ready.clear()
            show_window()
            root.protocol('WM_DELETE_WINDOW', root.destroy)
            messagebox.showerror('System tray unavailable', command[1])
    refresh()
    root.after(500, poll)

poll()
root.mainloop()
