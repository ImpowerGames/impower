import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-setup",
  stores: { workspace },
  html: ({ stores }) => {
    const panel = stores?.workspace?.current?.panes?.setup?.panel || "details";
    return html`
      <s-router key="setup-panel" directional active="${panel}">
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
              icon="info-circle"
              value="details"
              ${panel === "details" ? "active" : ""}
            >
              Details
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="share"
              value="share"
              ${panel === "share" ? "active" : ""}
            >
              Share
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="triangle-square-circle"
              value="assets"
              ${panel === "assets" ? "active" : ""}
            >
              Assets
            </s-tab>
          </s-tabs>
        </s-box>
        <se-details></se-details>
        <template value="details">
          <se-details></se-details>
        </template>
        <template value="share">
          <se-share></se-share>
        </template>
        <template value="assets">
          <se-assets></se-assets>
        </template>
      </s-router>
    `;
  },
  css,
});
