let workspaceModule: Promise<typeof import("../../workspace/Workspace")> | undefined;

export const intents = async () =>
  (await (workspaceModule ??= import("../../workspace/Workspace"))).Workspace;
