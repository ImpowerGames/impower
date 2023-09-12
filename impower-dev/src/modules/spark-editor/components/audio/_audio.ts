import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-audio",
  css,
  cache: WorkspaceCache,
  reducer: (store?: WorkspaceStore) => ({
    panel: store?.panes?.audio?.panel || "sounds",
  }),
  html: ({ state }) => {
    const { panel } = state;
    return html`
      <s-router directional key="audio-panel" active="${panel}">
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
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="wave-saw"
              value="sounds"
              ${panel === "sounds" ? "active" : ""}
            >
              Sounds
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="music"
              value="music"
              ${panel === "music" ? "active" : ""}
            >
              Music
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="sounds">
          <se-sounds></se-sounds>
        </template>
        <template value="music">
          <se-music></se-music>
        </template>
      </s-router>
    `;
  },
});
