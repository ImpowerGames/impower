import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const panel = state?.store?.panes?.preview?.panel || "game";
  const gameComponent = () => html`<se-preview-game></se-preview-game>`;
  const screenplayComponent = () =>
    html`<se-preview-screenplay></se-preview-screenplay>`;
  return {
    html: html`
      <s-router key="preview" active="${panel}">
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-box height="header-nav"></s-box>
        </s-box>
        ${panel === "screenplay" ? screenplayComponent : gameComponent}
        <template value="game">${gameComponent}</template>
        <template value="screenplay">${screenplayComponent}</template>
      </s-router>
    `,
  };
};
