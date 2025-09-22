import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      textPulledAt: stores?.workspace?.current?.sync?.textPulledAt || "",
    } as const),
  html: () => {
    return html`
      <se-preview-screenplay-toolbar></se-preview-screenplay-toolbar>
      <s-box position="relative" grow>
        <se-scrollable>
          <sparkdown-screenplay-preview
            scroll-margin="0 0 60px 0"
            top="48px"
          ></sparkdown-screenplay-preview>
        </se-scrollable>
      </s-box>
    `;
  },
  css,
});
