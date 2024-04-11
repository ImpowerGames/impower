import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-share",
  stores: { workspace },
  html: ({ stores }) => {
    const panel = stores?.workspace?.current?.panes?.share?.panel || "game";
    return html`
      <s-router key="share-panel" directional active="${panel}">
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-box height="header-nav"></s-box>
          <s-tabs color="tab-active" height="panel-nav" active="${panel}">
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="pacman"
              active-icon="pacman"
              value="game"
              ${panel === "game" ? "active" : ""}
            >
              Game
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="binder"
              active-icon="binder"
              value="screenplay"
              ${panel === "screenplay" ? "active" : ""}
            >
              Screenplay
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="game">
          <se-share-game></se-share-game>
        </template>
        <template value="screenplay">
          <se-share-screenplay></se-share-screenplay>
        </template>
      </s-router>
    `;
  },
  css,
});
