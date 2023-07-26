import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.graphics?.panel || "sprites";
  return {
    html: html`
      <s-router directional key="window/graphics" active="${mode}">
        <s-tabs
          color="tab-active"
          height="panel-nav"
          bg-color="panel"
          position="sticky-top"
          slot="header"
          active="${mode}"
        >
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-tab
            color="tab-active"
            text-color="tab-inactive"
            p="20"
            child-layout="row"
            icon="pacman"
            value="sprites"
            ${mode === "sprites" ? "active" : ""}
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
            ${mode === "maps" ? "active" : ""}
          >
            Maps
          </s-tab>
        </s-tabs>
        <template value="sprites">
          <se-sprites></se-sprites>
        </template>
        <template value="maps">
          <se-maps></se-maps>
        </template>
      </s-router>
    `,
  };
};
