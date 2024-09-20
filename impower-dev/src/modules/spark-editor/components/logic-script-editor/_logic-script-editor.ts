import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-script-editor",
  stores: { workspace },
  props: {
    filename: "",
  },
  reducer: ({ stores }) =>
    ({
      textPulledAt: stores?.workspace?.current?.sync?.textPulledAt || "",
      splitLayout: stores?.workspace?.current?.screen?.splitLayout,
    } as const),
  html: ({ context }) => {
    const { splitLayout } = context;
    return html`
      <s-box bg-color="editor-bg" grow>
        <sparkdown-script-editor
          id="sparkdownScriptEditor"
          scroll-margin="${splitLayout ? "56px 0 60px 0" : "104px 0 60px 0"}"
          top="${splitLayout ? "48px" : "104px"}"
        ></sparkdown-script-editor>
      </s-box>
    `;
  },
  selectors: {
    sparkdownScriptEditor: "",
  } as const,
  css,
});
