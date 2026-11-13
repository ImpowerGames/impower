# Android emulator route

`--device android` on `verify`, `ui` or `screenshot` runs the editor in Chrome on an Android Virtual Device through Playwright's experimental Android support.

## Setup

Done once, outside the repository: Android Studio with its platform-tools and emulator (and the Windows Hypervisor Platform on Windows); a Pixel-class virtual device on API 34 with a Google APIs image; Chrome 87 or later on it; platform-tools on PATH or `ANDROID_HOME` set to the SDK folder. `ANDROID_SERIAL` picks one of several attached devices.

The driver starts Chrome with a command line, which Chrome reads only when it is the device's debug app or when "Enable command line on non-rooted devices" is on in `chrome://flags`, so the flag is needed only when Chrome is not the debug app: `adb shell settings get global debug_app` printing `com.android.chrome` means it is.

The driver installs nothing: a missing adb (the message names every place it looked), device or Chrome fails at once with the setup steps in the message, a Chrome that dies or offers no debugging connection fails the run after 60 s, and a device whose `adb shell` stops answering while `adb devices` still lists it fails the command after 30 s, each with its cleanup done.

The emulator shares the host clipboard by default, and the keyboard's suggestion strip can then show host clipboard text in a device screenshot. Turn it off under the emulator's Extended controls, Settings, General, "Enable clipboard sharing", and never attach a screenshot that shows it. In Git Bash, prefix adb commands that take a device path with `MSYS_NO_PATHCONV=1`, since an argument starting with `/` is rewritten into a Windows path.

## What a run does

- Tab: each run drives a tab it opened and closes it at the end. The launch restarts Chrome and opens a blank tab, which is the only tab Chrome lays out, so the run takes the one blank tab with a non-zero size; when not exactly one qualifies, it opens a new tab and that launch tab stays (the report's `device.tab` says which). Tabs it did not open are never driven or closed. A page that measures 0x0 or whose `document.visibilityState` is not `visible` fails the run at its start, naming the cause, whatever else happened.
- Serving: the driver maps the editor, player and HMR ports with `adb reverse`, so the device's `localhost` is the dev server, a secure context as OPFS and the service worker require (`10.0.2.2` is not one), and removes them when the run ends. A port already mapped to the same host port is one a killed run of this checkout left: the run takes it over, lists it in `device.leftoverPorts` beside `device.reversedPorts`, and removes it too. A mapping that sends an editor port to a different host port is refused, naming the mapping, rather than silently serving another checkout.
- Queue: one driver process holds a device at a time, machine-wide, by listening on a loopback port derived from the serial (36900–36999); the hold ends with the process, even a killed one. Another prints `waiting for Android device <serial>: held by pid …, session …, worktree …, running …` and waits up to `--device-wait <seconds>` (default 900), then fails naming the holder; no bind, lookup or pause runs past that limit, and `--device-wait 0` tries once without asking who holds it.
- Screenshots: `--shot` on `ui` and `verify`, and `screenshot`, save the whole device screen through `device.screenshot()`, status bar, Chrome's toolbar and keyboard included; `ui --shot-of page` keeps the page alone. A shot right after a [named step](../SKILL.md#named-steps) is gated on the surface that step names in `steps.mjs` (`waitsFor`), not on the script editor: it waits for that surface to show, finish its animations and paint two frames, reports it as `waitedFor`, and fails when it never does.
- Input and display: `--tap X,Y`, `--long-press X,Y[:MS]` (default 750 ms) and `--swipe X1,Y1:X2,Y2[:MS]` (default 300 ms) take the device screenshot's pixel coordinates and go through the device's `input` command; `--rotate portrait|landscape` turns the display; `--viewport` sets the screen density so the page has that CSS width. Rotation and density are restored when the run ends; after an interrupted run, `adb shell wm density reset`.
- The report's `device` field names the serial, model, Chrome version, density, the tab driven, the mapped ports and the page's measured size.
