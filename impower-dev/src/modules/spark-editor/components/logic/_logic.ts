import { html } from "../../core/html";
import { WorkspaceState } from "../../state/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.logic?.panel || "main";
  return {
    html: html`
      <s-router directional key="window/logic" active="${mode}">
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
            text-color="tab-inactive"
            p="20"
            child-layout="row"
            icon="code"
            value="main"
            ${mode === "main" ? "active" : ""}
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
            ${mode === "scripts" ? "active" : ""}
          >
            Scripts
          </s-tab>
        </s-tabs>
        <template value="main">
          <se-script-editor file-path="logic/main.sd"></se-script-editor>
        </template>
        <template value="scripts">
          <se-file-list directory-path="logic/scripts">
            <se-add-fab>Add Script</se-add-fab>
          </se-file-list>
        </template>
      </s-router>
    `,
  };
};
