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
