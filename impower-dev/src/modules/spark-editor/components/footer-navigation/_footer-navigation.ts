import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-footer-navigation",
  stores: { workspace },
  reducer: ({ workspace }) => ({
    pane: workspace?.current?.pane || "logic",
  }),
  html: ({ context }) => {
    const { pane } = context;
    return html`
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
              <s-tabs
                active="logic"
                indicator="none"
                height="footer-nav"
                active="${pane}"
              >
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
  css,
});
