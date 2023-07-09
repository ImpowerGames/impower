import * as vscode from "vscode";
import { SparkdownOutlineFileDecorationProvider } from "../providers/SparkdownOutlineFileDecorationProvider";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";
import { SparkdownSymbolProvider } from "../providers/SparkdownSymbolProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { changeSparkdownUIPersistence, uiPersistence } from "./persistence";

export const activateOutlineView = (context: vscode.ExtensionContext): void => {
  // Register Outline view
  vscode.window.registerTreeDataProvider(
    "sparkdown-outline",
    SparkdownOutlineTreeDataProvider.instance
  );
  SparkdownOutlineTreeDataProvider.instance.treeView =
    vscode.window.createTreeView("sparkdown-outline", {
      treeDataProvider: SparkdownOutlineTreeDataProvider.instance,
      showCollapseAll: true,
    });
  vscode.window.registerFileDecorationProvider(
    SparkdownOutlineFileDecorationProvider.instance
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.outline.visibleitems", () => {
      const quickPick = vscode.window.createQuickPick();
      quickPick.canSelectMany = true;
      quickPick.items = [
        {
          alwaysShow: true,
          label: "Notes",
          detail: "[[Text enclosed between two brackets]]",
          picked: uiPersistence.outline_visibleNotes,
        },
        {
          alwaysShow: true,
          label: "Synopses",
          detail: "= Any line which starts like this",
          picked: uiPersistence.outline_visibleSynopses,
        },
        {
          alwaysShow: true,
          label: "Sections",
          detail: "# Sections begin with one or more '#'",
          picked: uiPersistence.outline_visibleSections,
        },
        {
          alwaysShow: true,
          label: "Scenes",
          detail:
            "Any line starting with INT. or EXT. is a scene. Can also be forced by starting a line with '.'",
          picked: uiPersistence.outline_visibleScenes,
        },
      ];
      quickPick.selectedItems = quickPick.items.filter((item) => item.picked);
      quickPick.onDidChangeSelection((e) => {
        let visibleScenes = false;
        let visibleSections = false;
        let visibleSynopses = false;
        let visibleNotes = false;
        for (let i = 0; i < e.length; i++) {
          if (e[i]?.label === "Notes") {
            visibleNotes = true;
          }
          if (e[i]?.label === "Scenes") {
            visibleScenes = true;
          }
          if (e[i]?.label === "Sections") {
            visibleSections = true;
          }
          if (e[i]?.label === "Synopses") {
            visibleSynopses = true;
          }
        }
        changeSparkdownUIPersistence("outline_visibleNotes", visibleNotes);
        changeSparkdownUIPersistence("outline_visibleScenes", visibleScenes);
        changeSparkdownUIPersistence(
          "outline_visibleSections",
          visibleSections
        );
        changeSparkdownUIPersistence(
          "outline_visibleSynopses",
          visibleSynopses
        );
        const uri = getActiveSparkdownDocument();
        SparkdownOutlineTreeDataProvider.instance.update(context, uri);
      });
      quickPick.show();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.outline.reveal", () => {
      const uri = getActiveSparkdownDocument();
      SparkdownOutlineTreeDataProvider.instance.reveal(uri);
    })
  );
  //Setup symbols (outline)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "sparkdown" },
      new SparkdownSymbolProvider()
    )
  );

  const uri = getActiveSparkdownDocument();
  SparkdownOutlineFileDecorationProvider.instance.update(uri);
};
