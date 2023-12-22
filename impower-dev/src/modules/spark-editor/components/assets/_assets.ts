import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-assets",
  stores: { workspace },
  html: ({ stores }) => {
    const panel = stores?.workspace?.current?.panes?.assets?.panel || "files";
    return html`
      <s-router key="assets-panel" directional active="${panel}">
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
              icon="photo"
              value="files"
              ${panel === "files" ? "active" : ""}
            >
              Files
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="sliders"
              value="specs"
              ${panel === "specs" ? "active" : ""}
            >
              Specs
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="files">
          <se-assets-files></se-assets-files>
        </template>
        <template value="specs">
          <se-assets-specs></se-assets-specs>
        </template>
      </s-router>
    `;
  },
  css,
});
