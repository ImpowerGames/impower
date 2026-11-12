import type WorkspaceSearch from "../../workspace/WorkspaceSearch";

let loaded: WorkspaceSearch | undefined;
let loading: Promise<WorkspaceSearch> | undefined;

export const loadSearch = () =>
  (loading ??= import("../../workspace/Workspace").then(({ Workspace }) => {
    loaded = Workspace.search;
    return loaded;
  }));

export const withSearch = (run: (search: WorkspaceSearch) => unknown) => {
  if (loaded) {
    run(loaded);
  } else {
    void loadSearch().then(run);
  }
};

export const openFind = () =>
  withSearch((search) => search.openFindFromSelection());
