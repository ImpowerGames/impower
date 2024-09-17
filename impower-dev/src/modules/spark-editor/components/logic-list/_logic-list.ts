import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-list",
  stores: { workspace },
  reducer: ({ stores }) => ({
    panel: stores?.workspace?.current?.panes?.logic?.panel || "",
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
              value="main"
              ${panel === "main" ? "active" : ""}
            >
              <se-logic-diagnostics-label filename="main.script">
                <s-icon name="book-closed" m-r="8"></s-icon>
                Main
              </se-logic-diagnostics-label>
            </s-tab>
            <s-tab
              color="tab-active"
              text-color="tab-inactive"
              p="20"
              child-layout="row"
              value="scripts"
              ${panel === "scripts" ? "active" : ""}
            >
              <se-logic-diagnostics-label>
                <s-icon name="book" m-r="8"></s-icon>
                Scripts
              </se-logic-diagnostics-label>
            </s-tab>
          </s-tabs>
        </s-box>
        <template value="main">
          <se-logic-script-editor filename="main.script">
          </se-logic-script-editor>
        </template>
        <template value="scripts">
          <se-logic-scripts-list></se-logic-scripts-list>
        </template>
      </s-router>
    `;
  },
  css,
});
