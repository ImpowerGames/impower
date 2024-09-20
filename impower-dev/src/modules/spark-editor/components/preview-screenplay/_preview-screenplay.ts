import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      textPulledAt: stores?.workspace?.current?.sync?.textPulledAt || "",
      splitLayout: stores?.workspace?.current?.screen?.splitLayout,
    } as const),
  html: ({ context }) => {
    const { splitLayout } = context;
    return html`
      <se-preview-screenplay-toolbar></se-preview-screenplay-toolbar>
      <s-box bg-color="black" grow>
        <sparkdown-screenplay-preview
          scroll-margin="${splitLayout ? "56px 0 60px 0" : "104px 0 60px 0"}"
          top="${splitLayout ? "48px" : "104px"}"
        ></sparkdown-screenplay-preview>
      </s-box>
    `;
  },
  css,
});
