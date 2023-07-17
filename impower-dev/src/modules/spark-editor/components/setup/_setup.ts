import { html } from "../../core/html";
import { WorkspaceState } from "../../state/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.setup?.panel || "details";
  return {
    html: html`
      <s-router key="window/setup" directional active="${mode}">
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
            icon="arrow-bar-up"
            value="share"
            ${mode === "share" ? "active" : ""}
          >
            Share
          </s-tab>
        </s-tabs>
        <se-details></se-details>
        <template value="details">
          <se-details></se-details>
        </template>
        <template value="share">
          <se-share></se-share>
        </template>
      </s-router>
    `,
  };
};
