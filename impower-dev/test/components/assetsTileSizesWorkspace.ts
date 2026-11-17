import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const none = async () => undefined;
const nothing = () => () => {};

export const Workspace = {
  assets: {
    watch: nothing,
    upload: async () => [],
    addLink: async () => "",
    createFolder: async () => "",
    rename: async (path: string) => path,
    remove: none,
    move: async () => [],
    usedBy: async () => [],
    downloadAll: none,
    measureImages: async (paths: string[]) => {
      const files = workspace.assetListing.value!.files;
      const sizes = await Promise.all(
        paths.map(
          (path) =>
            new Promise<[string, { width: number; height: number } | null]>((done) => {
              const src = files[path]!.src!;
              const image = new Image();
              image.onload = () => done([src, { width: image.naturalWidth, height: image.naturalHeight }]);
              image.onerror = () => done([src, null]);
              image.src = src;
            }),
        ),
      );
      workspace.assetSizes.value = { ...workspace.assetSizes.value, ...Object.fromEntries(sizes) };
    },
    watchFacts: nothing,
    watchPicture: nothing,
    requestDuration: nothing,
    measureDurations: none,
  },
  window: {
    setListState: (lists: Record<string, unknown>) => {
      workspace.current = { ...workspace.current, lists: { ...workspace.current.lists, ...lists } };
    },
    navigateTo: () => {},
    openTrash: () => {},
    revealDocument: () => {},
  },
};
