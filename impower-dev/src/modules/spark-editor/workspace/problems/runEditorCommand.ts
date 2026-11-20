import type { EditorFixCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ChoseEditorFixMessage";
import {
  ADD_ASSET_COMMAND,
  missingAssetArgument,
} from "@impower/sparkdown/src/compiler/utils/missingAsset";
import workspace from "../WorkspaceStore";

export async function runEditorCommand(command: EditorFixCommand): Promise<boolean> {
  if (command.command !== ADD_ASSET_COMMAND) {
    return false;
  }
  const asset = missingAssetArgument(command.arguments?.[0]);
  if (!asset) {
    return false;
  }
  const { Workspace } = await import("../Workspace");
  Workspace.window.setListState({ assetsType: asset.type });
  workspace.assetsAdd.value = asset;
  Workspace.window.navigateTo("assets");
  return true;
}
