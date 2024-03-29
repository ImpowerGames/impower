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
              icon="pacman #5b799a"
              active-icon="pacman white"
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
              icon="album #5b799a"
              active-icon="album white"
              value="project"
              ${panel === "project" ? "active" : ""}
            >
              Project
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="game">
          <se-share-game></se-share-game>
        </template>
        <template value="project">
          <se-share-project></se-share-project>
        </template>
      </s-router>
    `;
  },
  css,
});
