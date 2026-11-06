import { beforeEach, describe, expect, it, vi } from "vitest";

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceWindow } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");

const google = {
  getAccess: vi.fn(),
  pickRemoteProjectFile: vi.fn(),
  pickRemoteProjectFolder: vi.fn(),
  signOut: vi.fn(),
};

const win = new WorkspaceWindow({
  fs: {},
  sync: { google },
} as unknown as ConstructorParameters<typeof WorkspaceWindow>[0]);

const calls: string[] = [];
vi.spyOn(win, "unloadProject").mockImplementation(() => {
  calls.push("unload");
});
vi.spyOn(win, "loadNewProject").mockImplementation((id: string) => {
  calls.push(`load ${id}`);
  return Promise.resolve(id);
});
vi.spyOn(win, "saveRemoteProject").mockImplementation(async (folder) => {
  calls.push(`save ${folder}`);
  return undefined;
});
vi.spyOn(win, "startPickingRemoteProjectResource").mockImplementation(() => {
  calls.push("pick start");
});
vi.spyOn(win, "finishPickingRemoteProjectResource").mockImplementation(() => {
  calls.push("pick end");
});

beforeEach(() => {
  calls.length = 0;
  Object.values(google).forEach((fn) => fn.mockReset());
  google.getAccess.mockResolvedValue({ token: "t" });
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local" },
  };
});

describe("the workspace's Google Drive actions", () => {
  it("opens a project from Drive through the picker", async () => {
    google.pickRemoteProjectFile.mockResolvedValue("drive-file");
    await win.openProjectFromDrive();
    expect(google.pickRemoteProjectFile).toHaveBeenCalledWith("t");
    expect(calls).toEqual([
      "pick start",
      "unload",
      "load drive-file",
      "pick end",
    ]);
  });

  it("leaves the project alone when the picker is cancelled or fails", async () => {
    google.pickRemoteProjectFile.mockResolvedValueOnce(null);
    await win.openProjectFromDrive();
    google.pickRemoteProjectFile.mockRejectedValueOnce(new Error("closed"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await win.openProjectFromDrive();
    expect(calls).toEqual(["pick start", "pick end", "pick start", "pick end"]);
  });

  it("does not open the picker without Drive access", async () => {
    google.getAccess.mockResolvedValue(undefined);
    await win.openProjectFromDrive();
    await win.saveProjectToDrive();
    expect(calls).toEqual([]);
  });

  it("saves this project into a chosen Drive folder", async () => {
    google.pickRemoteProjectFolder.mockResolvedValue("folder");
    await win.saveProjectToDrive();
    expect(google.pickRemoteProjectFolder).toHaveBeenCalledWith("t");
    expect(calls).toEqual(["pick start", "save folder", "pick end"]);
  });

  it("signs out to the local project", async () => {
    workspace.account.value = {
      uid: "u",
      displayName: "Writer",
      email: "writer@example.com",
      token: "t",
      expires: 0,
      scope: "",
      consented: true,
      offline: false,
    };
    await win.signOutOfGoogleDrive();
    expect(google.signOut).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["unload", "load local"]);
    expect(workspace.account.value).toBeNull();
  });
});
