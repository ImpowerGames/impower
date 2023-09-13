import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-graphics",
  cache: WorkspaceCache,
  css,
  reducer: (store?: WorkspaceStore) => ({
    panel: store?.panes?.graphics?.panel || "sprites",
  }),
  html: ({ state }) => {
    const { panel } = state;
    return html`
      <s-router directional key="graphics-panel" active="${panel}">
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
              value="sprites"
              ${panel === "sprites" ? "active" : ""}
            >
              Sprites
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="wall"
              value="maps"
              ${panel === "maps" ? "active" : ""}
            >
              Maps
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="sprites">
          <se-sprites></se-sprites>
        </template>
        <template value="maps">
          <se-maps></se-maps>
        </template>
      </s-router>
    `;
  },
});
