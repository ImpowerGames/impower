import { PanelState } from "../types/state/panelState";

export const createPanelState = (): PanelState => ({
  paneSize: "50%",
  panels: {
    setup: {
      openPanel: "setup",
      section: "details",
    },
    assets: {
      openPanel: "assets",
    },
    logic: {
      openPanel: "logic",
      scripting: true,
      editorState: {
        folded: null,
      },
    },
    test: { openPanel: "test" },
  },
});
