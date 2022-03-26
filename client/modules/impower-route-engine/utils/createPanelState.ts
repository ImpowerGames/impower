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
      scripting: false,
    },
    entities: {
      openPanel: "entities",
      scripting: false,
    },
    logic: {
      openPanel: "logic",
      scripting: true,
    },
    test: { openPanel: "test" },
  },
});
