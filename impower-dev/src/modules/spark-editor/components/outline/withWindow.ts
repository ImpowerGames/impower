type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

export const withWindow = (act: (win: WorkspaceWindow) => unknown) =>
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    act(Workspace.window),
  );
