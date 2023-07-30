import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const mode = state?.store?.panes?.setup?.panel || "details";
  return {
    html: html`
      <s-router key="window/setup" directional active="${mode}">
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-box height="header-nav"></s-box>
          <s-tabs color="tab-active" height="panel-nav" active="${mode}">
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="info-circle"
              value="details"
              ${mode === "details" ? "active" : ""}
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
              ${mode === "share" ? "active" : ""}
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
              ${mode === "assets" ? "active" : ""}
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
    `,
  };
};
