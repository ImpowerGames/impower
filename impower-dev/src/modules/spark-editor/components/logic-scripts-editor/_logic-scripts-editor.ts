import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-logic-scripts-editor",
  css,
  cache: WorkspaceCache,
  reducer: (store?: WorkspaceStore) => ({
    filename:
      store?.panes?.logic?.panels?.scripts?.activeEditor?.filename || "",
  }),
  html: ({ state }) => {
    const { filename } = state;
    const displayName = filename.split(".")[0] ?? "";
    return html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-script-editor filename="${filename}"></se-script-editor>
      </s-box>
    `;
  },
});
