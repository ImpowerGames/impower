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
