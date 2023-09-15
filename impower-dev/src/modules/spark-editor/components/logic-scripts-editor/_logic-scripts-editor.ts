import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-scripts-editor",
  stores: { workspace },
  html: ({ stores }) => {
    const filename =
      stores?.workspace?.current?.panes?.logic?.panels?.scripts?.activeEditor
        ?.filename || "";
    const displayName = filename.split(".")[0] ?? "";
    return html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-script-editor filename="${filename}"></se-script-editor>
      </s-box>
    `;
  },
  css,
});
