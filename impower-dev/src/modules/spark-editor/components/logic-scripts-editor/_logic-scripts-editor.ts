import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";

export default spec({
  tag: "se-logic-scripts-editor",
  context: WorkspaceContext.instance,
  css,
  html: ({ store }) => {
    const filename =
      store?.panes?.logic?.panels?.scripts?.activeEditor?.filename || "";
    const displayName = filename.split(".")[0] ?? "";
    return html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-script-editor filename="${filename}"></se-script-editor>
      </s-box>
    `;
  },
});
