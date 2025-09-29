import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-scripts-editor",
  stores: { workspace },
  selectors: {
    nameInput: "#nameInput",
  } as const,
  reducer: ({ stores }) =>
    ({
      filename:
        stores?.workspace?.current?.panes?.logic?.panels?.scripts?.activeEditor
          ?.filename || "",
    } as const),
  html: ({ context }) => {
    const { filename } = context;
    const displayName = filename.split(".")[0] ?? "";
    return html`
      <se-file-editor-navigation>
        <se-logic-diagnostics-label filename="${filename}">
          <s-input
            display="inline-block"
            id="nameInput"
            placeholder-color="fab-bg"
            color="fg"
            value="${displayName || ""}"
            label="${displayName || ""}"
            width="100%"
            text-align="center"
            bg-color="transparent"
          ></s-input>
        </se-logic-diagnostics-label>
      </se-file-editor-navigation>
      <s-box position="relative" grow>
        <se-logic-script-editor filename="${filename}"></se-logic-script-editor>
      </s-box>
    `;
  },
  css,
});
