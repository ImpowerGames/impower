import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./main-window.css";

export default spec({
  tag: "se-main-window",
  stores: { workspace },
  reducer: ({ stores }) => ({
    pane: stores?.workspace?.current?.pane || "",
  }),
  html: ({ context }) => {
    const pane = context.pane;
    return html`
      <se-header-navigation></se-header-navigation>
      <s-split-pane
        id="splitPane"
        flex
        min-panel-width="320px"
        divider-offset="0"
        divider-color="fg-06"
        responsive="hide"
      >
        <s-box position="relative" child-layout="column" flex slot="start">
          <s-router key="pane" event-source="window" active="${pane}">
            <template value="logic">
              <se-logic></se-logic>
            </template>
            <template value="assets">
              <se-assets></se-assets>
            </template>
            <template value="share">
              <se-share></se-share>
            </template>
          </s-router>
        </s-box>
        <s-box position="relative" child-layout="column" flex slot="end">
          <s-box position="absolute" i="48px 0 0 0" bg-color="black"></s-box>
          <se-preview></se-preview>
        </s-box>
      </s-split-pane>
      <se-notifications></se-notifications>
      <s-box height="footer-nav"></s-box>
      <s-box position="fixed-bottom">
        <s-box position="relative" bg-color="primary-bg">
          <s-divider
            position="absolute"
            i="0 0 auto 0"
            bg-color="fg-06"
          ></s-divider>
          <s-tabs indicator="none" height="footer-nav" active="${pane}">
            <s-tab
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
              shrink
              disable-ripple
              icon="bolt"
              active-icon="bolt-fill"
              value="logic"
              ${pane === "logic" ? "active" : ""}
            >
              Logic
            </s-tab>
            <s-tab
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
              shrink
              disable-ripple
              icon="photo"
              active-icon="photo-fill"
              value="assets"
              ${pane === "assets" ? "active" : ""}
            >
              Assets
            </s-tab>
            <s-tab
              active-text-color="tab-active"
              inactive-text-color="tab-inactive"
              shrink
              disable-ripple
              icon="share"
              active-icon="share-fill"
              value="share"
              ${pane === "share" ? "active" : ""}
            >
              Share
            </s-tab>
          </s-tabs>
        </s-box>
      </s-box>
    `;
  },
  selectors: {
    splitPane: "",
    footerVisibilityManager: "",
  } as const,
  css: [...sharedCSS, css],
});
