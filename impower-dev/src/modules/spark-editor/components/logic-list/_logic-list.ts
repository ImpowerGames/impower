import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";

export default spec({
  tag: "se-logic-list",
  context: WorkspaceContext.instance,
  css,
  html: ({ store }) => {
    const panel = store?.panes?.logic?.panel || "main";
    return html`
      <s-router key="logic-panel" directional active="${panel}">
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
          <se-script-editor filename="main.script"></se-script-editor>
        </template>
        <template value="scripts">
          <se-logic-scripts-list></se-logic-scripts-list>
        </template>
      </s-router>
    `;
  },
});
