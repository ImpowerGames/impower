export type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

let pending: Promise<WorkspaceWindow> | undefined;

export const workspaceWindow = (): Promise<WorkspaceWindow> =>
  (pending ??= import("../../workspace/Workspace").then(
    ({ Workspace }) => Workspace.window,
  ));

export const withWindow = async (
  act: (win: WorkspaceWindow) => unknown,
): Promise<void> => {
  await act(await workspaceWindow());
};
