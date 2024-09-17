import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview",
  stores: { workspace },
  reducer: ({ stores }) => ({
    projectId: stores?.workspace?.current?.project?.id || "",
    mode: stores?.workspace?.current?.preview?.mode || "game",
  }),
  html: ({ context }) => {
    const projectId = context.projectId;
    const mode = projectId ? context.mode : "";
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
