import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const openScriptFilePath =
    state?.store?.logic?.panels?.scripts?.openFilePath || "";
  const fileName = openScriptFilePath.split("/").slice(-1).join("");
  const displayName = fileName.split(".")[0] ?? "";
  return {
    html: html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-script-editor file-path="${openScriptFilePath}"></se-script-editor>
      </s-box>
    `,
  };
};
