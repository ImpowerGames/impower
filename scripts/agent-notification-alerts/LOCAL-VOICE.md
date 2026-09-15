# Optional local voice

The default remains Windows speech. To opt into offline Kokoro on Windows:

1. In a personal Python environment install `kokoro-onnx==0.6.1` and `soundfile==0.14.0`.
2. Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the upstream [model-files-v1.1 release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1) into a personal model directory.
3. Set `AGENT_ALERT_PYTHON` to that environment's Python executable and `AGENT_ALERT_KOKORO_DIR` to the model directory in the notifier's launcher environment.
4. Optionally set `AGENT_ALERT_KOKORO_VOICE` (default `bm_lewis`) and `AGENT_ALERT_KOKORO_LANG` (default `en-gb`). Use matching entries from the [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
5. Restart the notifier broker and the MCP connection so they receive the new environment. Broker stop preserves pending alerts.

Runtime synthesis uses local files and CPU execution with two inference threads. No text is sent to a speech service. Initial model loading adds latency to each alert. Volume and rate retain their existing controls. A configured Kokoro failure is reported as a speech channel error; keyboard alerts remain independent. Leave `AGENT_ALERT_KOKORO_DIR` unset to return to Windows speech.

Keep model files and machine-specific settings outside this repository. The runtime is MIT licensed and the model is Apache 2.0 licensed; see upstream licensing when redistributing.

## Desktop mute control

The Keyboard lights card lets you select distinct function keys F1–F12 for Codex and Claude, then Apply keys. Each selection controls both the flashing key and that agent's existing Ctrl+Shift or Ctrl+Alt shortcut. Pass `--config` with the receiver's personal config file (or set `AGENT_ALERT_CONFIG`) to display its initial keys and modifier. Choices are saved atomically in `key-bindings.json` in the shared state directory and applied on the next heartbeat. Existing notifications are retained. A shortcut already claimed by another application is reported as unavailable in receiver status; choose another key in that case. Arbitrary non-function keys are not offered by this UI.

Pass `--kokoro-dir` with the installed model directory (or set `AGENT_ALERT_KOKORO_DIR`) to enable the local voice dropdown. It lists the installed American and British English voices with accent and gender labels. Selecting a voice saves `voice.json` in the shared state directory; the next speech worker reads it and uses the matching English pronunciation. No MCP or receiver restart is required. An utterance already being spoken keeps its voice. Without a local model directory, the picker is disabled. The saved selection overrides the launcher's default voice; Lewis remains the default before selecting another voice.

The window and tray menu offer independent voice and light switches, plus Pause all alerts. Pause all uses a separate `all-muted` marker, so Resume restores the individual preferences. `lights-muted` suppresses light output; the receiver releases its SteelSeries effect on the next heartbeat (normally within a second). Pending notifications and shortcuts remain available. Resuming lights shows any alerts still pending, while speech received during a pause is not replayed.

Launch `src/desktop-controls.py` with `pythonw.exe` on Windows. Pass `--state-dir` with the receiver's `AGENT_ALERT_STATE_DIR` when using a custom state directory. A desktop shortcut can contain those arguments so the window opens without a console.

Install `pystray==0.19.5` and `Pillow==12.3.0` in the controls' Python environment. Minimize or close hides the window in the system tray. Click its speaker icon to reopen; right-click for Open, voice and light switches, Pause/Resume, and Quit controls. Green indicates both channels enabled; amber indicates at least one channel muted. The window and tray share the same icon. Quitting the controls removes the icon without stopping the notification receiver or changing the saved mute preference. Windows may put the icon under its hidden-icons arrow.

The button saves a `voice-muted` marker in that directory. It suppresses incoming spoken alerts and stops the current speech worker when detected (checked every 100 ms). Keyboard lighting, pending notifications, acknowledgements and shortcuts continue normally. Closing the window preserves the preference; unmuting does not replay notifications received while muted. Both Windows speech and Kokoro honor the control. The app must use the same state directory as the receiver.

## Automatic mute during Discord calls

Connecting the current Discord user to any voice channel — self-muted, self-deafened, alone, or listening-only — silences spoken alerts and stops speech already playing, the same way the manual voice mute does but through its own `discord-call-muted` marker. Ending the call or turning the control off removes only that marker; a manual voice mute or Pause all is never touched, and speech suppressed during a call is not replayed afterward. Keyboard lighting, pending notifications, acknowledgements and shortcuts continue normally throughout.

The behavior is opt-out, enabled by default. The desktop window's **Mute voice during Discord calls** switch persists its own `discord-mute-disabled` marker; turning it off stops the automatic mute without affecting the manual voice or lights switches, even mid-call. The window and tray report **Voice muted · Discord call** while the automatic condition is active.

Detection is entirely optional and fail-open, using a personal [Discord application](https://discord.com/developers/applications). Create one, then on its **OAuth2** page (not the **OAuth2 URL Generator** below it — that tool is unrelated) add `http://localhost` under **Redirects** and save; it is never actually visited, but Discord's token exchange requires it to be registered. Copy the application's client ID and secret from the same page, then enable detection either way:

- In the desktop window's **Discord application** fields, enter the client ID and secret and click **Save credentials**. They are written to `discord-credentials.json` in the shared state directory; the receiver notices a new or changed file within about a second, no restart required. A blank secret on a later save keeps the one already stored, so re-saving just the client ID never clears it. The desktop app never redisplays a saved secret.
- Or set `AGENT_ALERT_DISCORD_CLIENT_ID` (and `AGENT_ALERT_DISCORD_CLIENT_SECRET`) in the receiver's launcher environment. A saved `discord-credentials.json` takes priority over these variables when both are present.

`AGENT_ALERT_DISCORD_REDIRECT_URI` overrides the `http://localhost` default if a different registered redirect is preferred; it only needs to match what the application's OAuth2 page has saved. Set `AGENT_ALERT_DISCORD_DEBUG=1` in the receiver's environment to log every raw message exchanged with the local Discord client to its console, useful for diagnosing an unexpected authorization failure.

Without either, or on any Windows machine without Discord installed or running, the receiver behaves exactly as before: no prompts, no errors, no muting. Losing the Discord connection, a malformed response, or an expired authorization all recover on their own with a growing backoff between reconnect attempts; none of them stop the receiver or the desktop controls.

The one-time authorization is explicit, never automatic: the desktop app's **Connect Discord** button (shown while unauthorized, unavailable, or not yet configured) writes a `discord-connect-request` marker. The receiver notices it on its next check, asks the running Discord client to show its consent prompt, and exchanges the resulting code for a token it stores as `discord-token.json` in the shared state directory. Approving that one Discord prompt is the only setup step; later launches reuse the stored token (refreshing it as needed) without prompting again. A teammate who never enters or sets a client ID, never approves the prompt, or turns the control off keeps using every other Agent Alerts feature exactly as before.
