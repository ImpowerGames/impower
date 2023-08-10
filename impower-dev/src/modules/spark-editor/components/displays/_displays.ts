import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const panel = state?.store?.panes?.displays?.panel || "widgets";
  return {
    html: html`
      <s-router directional key="displays-panel" active="${panel}">
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
              icon="shape"
              value="widgets"
              ${panel === "widgets" ? "active" : ""}
            >
              Widgets
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="template"
              value="views"
              ${panel === "views" ? "active" : ""}
            >
              Views
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="widgets">
          <se-widgets></se-widgets>
        </template>
        <template value="views">
          <se-views></se-views>
        </template>
      </s-router>
    `,
  };
};
