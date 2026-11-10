import type WorkspaceSearch from "../../workspace/WorkspaceSearch";

export const withSearch = (run: (search: WorkspaceSearch) => unknown) => {
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    run(Workspace.search),
  );
};

export const openFind = () =>
  withSearch((search) => search.openFindFromSelection());
