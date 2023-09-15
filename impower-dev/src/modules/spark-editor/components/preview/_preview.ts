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
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-box height="header-nav"></s-box>
          <s-box position="relative">
            <s-box
              position="absolute"
              inset="0"
              height="panel-nav"
              bg-color="panel"
            ></s-box>
          </s-box>
        </s-box>
        ${mode === "screenplay" ? screenplayComponent : gameComponent}
        <template value="game">${gameComponent}</template>
        <template value="screenplay">${screenplayComponent}</template>
      </s-router>
    `;
  },
  css,
});
