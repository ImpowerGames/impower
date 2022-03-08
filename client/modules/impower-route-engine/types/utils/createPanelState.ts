import { PanelState } from "../state/panelState";

export const createPanelState = (): PanelState => ({
  paneSize: "50%",
  panels: {
    Setup: {
      openPanel: "Setup",
      Container: {
        scripting: false,
        arrangement: "List",
      },
      Item: {
        section: "Details",
      },
      Detail: {},
    },
    Assets: {
      openPanel: "Assets",
      Container: {
        scripting: false,
        arrangement: "List",
      },
      Item: {
        section: "Command",
      },
      Detail: {},
    },
    Entities: {
      openPanel: "Container",
      Container: {
        scripting: false,
        arrangement: "List",
        inspectedTargetId: "",
      },
      Item: {
        section: "Element",
      },
      Detail: {},
    },
    Logic: {
      openPanel: "Container",
      Container: {
        scripting: true,
        arrangement: "List",
        inspectedTargetId: "",
      },
      Item: {
        section: "Command",
        lastAddedTypeIds: {
          Trigger: "EnteredTrigger",
          Command: "DoCommand",
          Variable: "StringVariable",
          Element: "TextElement",
        },
      },
      Detail: {},
    },
    Test: { openPanel: "Test" },
  },
});
