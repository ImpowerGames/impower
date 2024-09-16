import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  reducer: ({ workspace }) =>
    ({
      textPulledAt: workspace?.current?.sync?.textPulledAt || "",
      splitLayout: workspace?.current?.screen?.splitLayout,
    } as const),
  html: ({ context }) => {
    const { splitLayout } = context;
    return html`
      <se-preview-screenplay-toolbar></se-preview-screenplay-toolbar>
      <s-box bg-color="black" grow>
        <sparkdown-screenplay-preview
          scroll-margin="${splitLayout ? "64px 0 68px 0" : "120px 0 68px 0"}"
        ></sparkdown-screenplay-preview>
      </s-box>
    `;
  },
  css,
});
