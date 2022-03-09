import { PanelState } from "../types/state/panelState";

export const createPanelState = (): PanelState => ({
  paneSize: "50%",
  panels: {
    Setup: {
      openPanel: "Setup",
      section: "Details",
    },
    Assets: {
      openPanel: "Assets",
      scripting: false,
    },
    Entities: {
      openPanel: "Entities",
      scripting: false,
    },
    Logic: {
      openPanel: "Logic",
      scripting: true,
    },
    Test: { openPanel: "Test" },
  },
});
