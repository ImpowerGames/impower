import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const nothing = () => () => {};

export const Workspace = {
  scripts: {
    watch: nothing,
    createFolder: async () => "",
    download: async () => undefined,
    move: async () => [],
    referencing: async () => [],
    remove: async () => undefined,
    rename: async (path: string) => path,
  },
  window: {
    setListState: (lists: Record<string, unknown>) => {
      workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
    },
    navigateTo: () => {},
    openScript: () => {},
    openTrash: () => {},
    finishEditing: () => {},
    openOutlineLocation: async () => {},
    setOutlineSceneCollapsed: () => {},
  },
};
