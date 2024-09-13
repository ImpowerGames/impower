import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-list",
  stores: { workspace },
  reducer: ({ workspace }) => ({
    panel: workspace?.current?.panes?.logic?.panel || "main",
  }),
  html: ({ context }) => {
    const { panel } = context;
    return html`
      <s-router key="logic-panel" directional active="${panel}">
        <s-box bg-color="panel" position="sticky-top" slot="header">
          <se-header-navigation-placeholder></se-header-navigation-placeholder>
          <s-tabs color="tab-active" height="panel-nav" active="${panel}">
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="book-closed"
              active-icon="book-closed"
              value="main"
              ${panel === "main" ? "active" : ""}
            >
              Main
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              icon="book"
              active-icon="book"
              value="scripts"
              ${panel === "scripts" ? "active" : ""}
            >
              Scripts
            </s-tab>
          </s-tabs>
        </s-box>
        <se-logic-script-editor filename="main.script"></se-logic-script-editor>
        <template value="main">
          <se-logic-script-editor
            filename="main.script"
          ></se-logic-script-editor>
        </template>
        <template value="scripts">
          <se-logic-scripts-list></se-logic-scripts-list>
        </template>
      </s-router>
    `;
  },
  css,
});
