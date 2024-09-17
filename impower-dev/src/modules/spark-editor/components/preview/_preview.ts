import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview",
  stores: { workspace },
  reducer: ({ stores }) => ({
    mode: stores?.workspace?.current?.preview?.mode || "",
  }),
  html: ({ context }) => {
    const mode = context.mode;
    return html`
      <s-router key="preview" active="${mode}">
        <template value="game">
          <se-preview-game></se-preview-game>
        </template>
        <template value="screenplay">
          <se-preview-screenplay></se-preview-screenplay>
        </template>
      </s-router>
    `;
  },
  css,
});
