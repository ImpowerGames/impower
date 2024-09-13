import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview",
  stores: { workspace },
  html: ({ stores }) => {
    const mode = stores?.workspace?.current?.preview?.mode || "game";
    const gameComponent = () => html`<se-preview-game></se-preview-game>`;
    const screenplayComponent = () =>
      html`<se-preview-screenplay></se-preview-screenplay>`;
    return html`
      <s-router key="preview" active="${mode}">
        ${mode === "screenplay" ? screenplayComponent : gameComponent}
        <template value="game">${gameComponent}</template>
        <template value="screenplay">${screenplayComponent}</template>
      </s-router>
    `;
  },
  css,
});
