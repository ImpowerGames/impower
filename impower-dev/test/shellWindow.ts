import type workspace from "../src/modules/spark-editor/workspace/WorkspaceStore";

type WorkspaceStore = typeof workspace;

export function shellWindow(
  store: () => WorkspaceStore,
  overrides: Record<string, unknown> = {},
) {
  return {
    setAccount: () => {},
    loadProject: async () => {},
    reviewDeviceStorage: async () => {},
    navigateTo: () => {},
    closeSettings: () => {},
    setAppMenuOpen: () => {},
    setRailWidth: () => {},
    setRailCompactWidth: () => {},
    setStripHeight: () => {},
    startEditing: () => {
      store().scriptMode.value = "editing";
    },
    finishEditing: () => {
      if (store().scriptMode.peek() !== "editing") {
        return;
      }
      store().scriptMode.value = "reading";
    },
    ...overrides,
  };
}
