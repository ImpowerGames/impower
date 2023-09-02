import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const filename =
    state?.store?.panes?.logic?.panels?.scripts?.activeEditor?.filename || "";
  const displayName = filename.split(".")[0] ?? "";
  return {
    html: html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-script-editor filename="${filename}"></se-script-editor>
      </s-box>
    `,
  };
};
