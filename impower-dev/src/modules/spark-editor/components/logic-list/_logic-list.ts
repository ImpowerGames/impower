import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const panel = state?.store?.panes?.logic?.panel || "main";
  return {
    html: html`
      <s-router key="window/logic/panel" directional active="${panel}">
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
              icon="code"
              value="main"
              ${panel === "main" ? "active" : ""}
            >
              Main
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="file-code"
              value="scripts"
              ${panel === "scripts" ? "active" : ""}
            >
              Scripts
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="main">
          <se-script-editor file-path="logic/main.sd"></se-script-editor>
        </template>
        <template value="scripts">
          <se-logic-scripts-list></se-logic-scripts-list>
        </template>
      </s-router>
    `,
  };
};
