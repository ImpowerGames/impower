import { html } from "../../core/html";
import { WorkspaceState } from "../../workspace/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.displays?.panel || "widgets";
  return {
    html: html`
      <s-router directional key="window/displays" active="${mode}">
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
            icon="shape"
            value="widgets"
            ${mode === "widgets" ? "active" : ""}
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
            ${mode === "views" ? "active" : ""}
          >
            Views
          </s-tab>
        </s-tabs>
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
