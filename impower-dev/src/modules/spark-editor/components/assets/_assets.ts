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
              p="20"
              child-layout="row"
              active-icon="files"
              icon="files"
              value="files"
              ${panel === "files" ? "active" : ""}
            >
              Files
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              active-icon="link"
              icon="link"
              value="urls"
              ${panel === "urls" ? "active" : ""}
            >
              URLs
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="files">
          <se-assets-files></se-assets-files>
        </template>
        <template value="urls">
          <se-assets-urls></se-assets-urls>
        </template>
      </s-router>
    `;
  },
  css,
});
