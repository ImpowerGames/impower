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
      <s-split-pane
        id="splitPane"
        grow
        min-panel-width="336px"
        resizer-color="scrollbar-track"
        divider-offset="0"
        divider-color="fg-06"
        responsive="hide"
      >
        <div class="scrollable" slot="start">
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
        </div>
        <div class="scrollable" slot="end">
          <s-box position="relative" grow>
            <se-preview></se-preview>
          </s-box>
        </div>
      </s-split-pane>
      <se-notifications></se-notifications>
      <s-hidden
        if-below="lg"
        hide-event="window/didExpandPreviewPane"
        show-event="window/didCollapsePreviewPane"
        hide-instantly
        show-instantly
      >
        <s-hidden
          if-below="lg"
          hide-event="editor/focused input/focused"
          show-event="editor/unfocused input/unfocused"
          hide-instantly
          show-delay="200ms"
        >
          <s-box height="footer-nav"></s-box>
          <s-box position="fixed-bottom">
            <s-box bg-color="primary-bg">
              <s-divider bg-color="fg-06"></s-divider>
              <s-tabs indicator="none" height="footer-nav" active="${pane}">
                <s-tab
                  color="tab-active"
                  text-color="tab-inactive"
                  shrink
                  icon="bolt"
                  active-icon="bolt-fill"
                  value="logic"
                >
                  Logic
                </s-tab>
                <s-tab
                  color="tab-active"
                  text-color="tab-inactive"
                  shrink
                  icon="photo"
                  active-icon="photo-fill"
                  value="assets"
                >
                  Assets
                </s-tab>
                <s-tab
                  color="tab-active"
                  text-color="tab-inactive"
                  shrink
                  icon="share"
                  active-icon="share-fill"
                  value="share"
                >
                  Share
                </s-tab>
              </s-tabs>
            </s-box>
          </s-box>
        </s-hidden>
      </s-hidden>
    `;
  },
  selectors: {
    splitPane: "",
  } as const,
  css: [...sharedCSS, css],
});
