# Functionality

This is an extension for Visual Studio Code which allows you to create `spark` games and screenplays using [Sparkdown](https://github.com/ImpowerGames/impower/tree/main/sparkdown) syntax.

## Features

- Syntax Highlighting
- Error Checking
- Autocompletion
- Screenplay PDF Export
- Translation CSV Export
- Game JSON Export
- Live Screenplay Preview
- Live Game Preview

# Usage

1. Open any `.sd` or `.sparkdown` file in Visual Studio Code.

2. Click the ![Sparkdown](https://raw.githubusercontent.com/ImpowerGames/impower/deploy/dev/.github/images/sparkdown-vscode-icon.png) icon in the activitybar to open the Sparkdown Sidebar.

![Screenshot](https://raw.githubusercontent.com/ImpowerGames/impower/deploy/dev/.github/images/sparkdown-vscode-screenshot-00.png)

> From the sidebar, you can...
>
> - Navigate through your screenplay using the `OUTLINE` panel.
> - View the Live Preview, export your Screenplay, and more, using the `COMMANDS` panel.
> - Quickly lookup sparkdown syntax in the `CHEAT SHEET` panel.

## Previewing suggestions in the Game Preview

When the Game Preview is open and stopped, highlighting a suggestion in the autocomplete list shows the scene as it would look with that suggestion accepted. Moving to another suggestion updates the preview, and moving back shows the earlier one again. The suggestion's details panel does not need to be open; its thumbnails are still there when you open it. The [suggestion preview guide](https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/SuggestionPreview.md) explains which scene is shown and how long a preview takes.

A highlighted suggestion is only a preview. Your script, its undo history, the saved file, the Problems panel and anything you export stay as they are until you accept a suggestion.

- Pressing Escape, clicking in the text, switching to another file or moving the focus out of the editor closes the list and returns the preview to your script as it is. When the focus moves out of the editor, for example to the Explorer or the Command Palette, the preview can take up to half a second to return.
- Accepting a suggestion inserts it as usual. The preview keeps showing that suggestion until the script has been compiled with it, so it does not flicker back to the old picture.
- The preview's toolbar says "Previewing suggestion" while a suggestion is on screen and "Preparing suggestion preview…" while one takes a moment. When a suggestion cannot be previewed, including a suggestion that comes from another extension rather than Sparkdown, the last picture stays and the toolbar says "Cannot preview this suggestion yet — showing the last valid preview". If you close the list while your script itself cannot be previewed, it says "Cannot preview the current document — showing the last valid preview".
- Only a Game Preview that is already open and stopped takes part. The preview never opens itself, a hidden preview stays as it is, highlighting suggestions does not change a game that is playing or paused, and Play always starts from your script, never from a suggestion.

VS Code tells extensions which suggestion is highlighted through its inline suggestion system, so while a suggestion list is open and the Game Preview is open, the extension asks VS Code for inline suggestions. This works whether or not `editor.inlineSuggest.enabled` is on, and no setting is changed. Other extensions that offer inline suggestions are asked at the same time, so their grey inline text can appear next to the highlighted suggestion even when inline suggestions are turned off. Pressing Enter still inserts only the highlighted suggestion.

# Extension Settings

This extension contributes the following settings:

- `sparkdown.preview`: Sparkdown Preview
- `sparkdown.export`: Sparkdown Export
- `sparkdown.editor`: Sparkdown Editor

> You can modify the look of your exported screenplays from `File > Preferences > Settings > Extensions > Sparkdown > Sparkdown Export`

# Development

> For contributors building the extension from source (not installing it from the
> Marketplace).

This package lives in an npm-workspaces monorepo. Install once from the **repo
root**, then start the extension's dev build loop with the root launcher:

```sh
npm install        # at the monorepo root — sets up all workspaces
npm run vscode:dev # at the monorepo root — builds + watches the extension
```

`vscode:dev` runs this package's `watch` (`npm-run-all -p watch:*`), which builds
and watches everything the extension bundles: the language server, the
spark-web-player, the screenplay-PDF exporter, and the screenplay / game / screen
/ inspector webviews, plus the extension host code itself.

With that watcher running, press **F5** in VS Code (the _Run Extension_ launch
config) to open an Extension Development Host with the extension loaded; rebuilds
from the watcher are picked up on reload.

> Working on the **web app** instead of the extension? Use `npm run web:dev` from
> the root — see the [root README](../README.md).

# Known Issues

[Issue Tracker](https://github.com/ImpowerGames/impower/labels/vscode)

- TODO: Game PWA Export

---

## Thanks / Third-party licenses

Forked from the wonderful extension [BetterFountain](https://github.com/piersdeseilligny/betterfountain) by Piers Deseilligny, covered by the [MIT License](https://github.com/piersdeseilligny/betterfountain/blob/master/LICENSE.md)
