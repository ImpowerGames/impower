import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-assets",
  stores: { workspace },
  reducer: ({ stores }) => ({
    panel: stores?.workspace?.current?.panes?.assets?.panel || "",
  }),
  html: ({ context }) => {
    const { panel } = context;
    return html`
      <s-router key="assets-panel" directional active="${panel}">
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
              disable-ripple
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
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
              disable-ripple
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
