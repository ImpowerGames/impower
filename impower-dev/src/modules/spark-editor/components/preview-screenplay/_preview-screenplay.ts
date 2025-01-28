import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      textPulledAt: stores?.workspace?.current?.sync?.textPulledAt || "",
      horizontalLayout: stores?.workspace?.current?.screen?.horizontalLayout,
    } as const),
  html: ({ context }) => {
    const { horizontalLayout } = context;
    return html`
      <se-preview-screenplay-toolbar></se-preview-screenplay-toolbar>
      <se-scrollable>
        <sparkdown-screenplay-preview
          scroll-margin="${horizontalLayout
            ? "56px 0 60px 0"
            : "104px 0 60px 0"}"
          top="${horizontalLayout ? "48px" : "104px"}"
        ></sparkdown-screenplay-preview>
      </se-scrollable>
    `;
  },
  css,
});
