import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-share",
  stores: { workspace },
  reducer: ({ stores }) => ({
    panel: stores?.workspace?.current?.panes?.share?.panel || "",
  }),
  html: ({ context }) => {
    const { panel } = context;
    return html`
      <s-router key="share-panel" directional active="${panel}">
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <se-header-navigation-placeholder></se-header-navigation-placeholder>
          <s-tabs
            indicator-color="tab-active"
            height="panel-nav"
            active="${panel}"
          >
            <s-tab
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
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
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
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
