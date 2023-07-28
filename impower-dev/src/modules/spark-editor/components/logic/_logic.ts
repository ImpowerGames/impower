import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const panelMode = state?.store?.logic?.panel || "main";
  const editingPath = state?.store?.logic?.panels.scripts.editingPath || "";
  const editMode = editingPath ? "editor" : "list";
  return {
    html: html`
      <s-router directional key="window/logic" active="${panelMode}">
        <s-tabs
          color="tab-active"
          height="panel-nav"
          bg-color="panel"
          position="sticky-top"
          active="${panelMode}"
          slot="header"
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
            text-color="tab-inactive"
            p="20"
            child-layout="row"
            icon="code"
            value="main"
            ${panelMode === "main" ? "active" : ""}
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
            ${panelMode === "scripts" ? "active" : ""}
          >
            Scripts
          </s-tab>
        </s-tabs>
        <template value="main">
          <se-script-editor
            id="main-script-editor"
            file-path="logic/main.sd"
          ></se-script-editor>
        </template>
        <template value="scripts">
          <s-router
            directional="z"
            key="window/logic/scripts"
            active="${editMode}"
          >
            <template value="editor">
              <se-script-editor
                id="item-script-editor"
                file-path="${editingPath}"
              ></se-script-editor>
            </template>
            <template value="list">
              <se-scripts></se-scripts>
            </template>
          </s-router>
        </template>
      </s-router>
    `,
  };
};
