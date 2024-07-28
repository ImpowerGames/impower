import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-scripts-editor",
  stores: { workspace },
  reducer: ({ workspace }) =>
    ({
      filename:
        workspace?.current?.panes?.logic?.panels?.scripts?.activeEditor
          ?.filename || "",
    } as const),
  html: ({ context }) => {
    const { filename } = context;
    const displayName = filename.split(".")[0] ?? "";
    return html`
      <se-file-editor-navigation>${displayName}</se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-logic-script-editor filename="${filename}"></se-logic-script-editor>
      </s-box>
    `;
  },
  css,
});
