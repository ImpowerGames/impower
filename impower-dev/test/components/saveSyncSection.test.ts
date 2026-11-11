import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  signInToGoogleDrive: vi.fn(),
  signOutOfGoogleDrive: vi.fn(),
  openProjectFromDrive: vi.fn(),
  exportLocalProject: vi.fn(),
  importLocalProject: vi.fn(),
  requestProjectReplace: vi.fn(),
  cancelProjectReplace: vi.fn(),
  confirmProjectReplace: vi.fn(),
  store: { project: { name: "Raffles" } },
}));
const downloads = vi.hoisted(() => vi.fn());
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: actions },
}));
vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({
  downloadFile: downloads,
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: SaveSyncSection } =
  await import("../../src/modules/spark-editor/components/settings/SaveSyncSection");
const { ReplaceProjectDialog } =
  await import("../../src/modules/spark-editor/components/replace-project");
const { default: AppMenu } =
  await import("../../src/modules/spark-editor/components/desktop-shell/AppMenu");

const account = {
  uid: "u",
  displayName: "Ada Writer",
  email: "ada@example.com",
  token: "t",
  expires: 0,
  scope: "",
  consented: true,
  offline: false,
};

const settle = async (ms = 30) => {
  for (let i = 0; i < 2; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }
};

const section = () => document.getElementById("save-settings")!;

const row = (id: string) => document.querySelector<HTMLElement>(`#${id}-name`)!.closest<HTMLElement>("[data-setting-row]")!;

const button = (label: string, within: ParentNode = document) =>
  Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label,
  );

const click = async (label: string, within?: ParentNode) => {
  await act(async () => button(label, within)!.click());
  await settle();
};

const setState = (projectId: string, status: string | undefined) =>
  act(() => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: projectId, name: "Raffles" },
      sync: { status } as typeof workspace.current.sync,
    };
  });

const hosts: HTMLElement[] = [];

const mount = async (...nodes: ReturnType<typeof h>[]) => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  await act(async () => render(h("div", null, ...nodes), host));
  await settle();
  return host;
};

const mountSection = () =>
  mount(
    h(SaveSyncSection, { section: { id: "save-settings", label: "Save & sync", title: "Save & sync" } }),
    h(ReplaceProjectDialog, null),
  );

beforeEach(async () => {
  Object.values(actions).forEach((fn) => typeof fn === "function" && fn.mockReset());
  downloads.mockReset();
  workspace.account.value = null;
  workspace.replaceProject.value = null;
  await setState("local", "cached");
});

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    await act(async () => render(null, host));
    host.remove();
  }
  workspace.replaceProject.value = null;
  await settle(250);
});

describe("the Save & sync section", () => {
  it("lays out the four rows in the prototype's order, with the local save tag", async () => {
    await mountSection();
    expect(section().querySelector("h3")!.textContent).toBe("Save & sync");
    expect(
      Array.from(section().querySelectorAll("[data-setting-row] strong")).map((el) => el.textContent),
    ).toEqual(["Saved to this device", "Download a backup", "Import a project", "Backup & sync online"]);
    expect(section().querySelector("[data-local-save]")!.textContent).toBe("Saved locally");
    expect(button("Download .zip", section())).toBeDefined();
    expect(button("Choose a .zip…", section())).toBeDefined();
  });

  it("reads Not saved locally from the same source as the app menu's heading", async () => {
    await setState("local", "load_error");
    await mountSection();
    expect(section().querySelector("[data-local-save]")!.textContent).toBe("Not saved locally");
    await act(async () => {
      workspace.current = { ...workspace.current, screen: { ...workspace.current.screen, appMenuOpen: true } };
    });
    const menuHost = await mount(h(AppMenu, null));
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect(section().contains(menu)).toBe(false);
    expect(menuHost.querySelector("button")!.textContent).toContain("Not saved locally");
    expect(menu.textContent).toContain("Not saved locally");
    expect(menu.textContent).not.toContain("Import Project");
    expect(menu.textContent).not.toContain("Export Project");
  });

  it("downloads the project as <project>.zip from Download .zip", async () => {
    const zip = new Uint8Array([1, 2, 3]);
    actions.exportLocalProject.mockResolvedValue(zip);
    await mountSection();
    await click("Download .zip", section());
    expect(actions.exportLocalProject).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveBeenCalledTimes(1);
    expect(downloads.mock.calls[0]![0]).toBe("Raffles.zip");
    expect(downloads.mock.calls[0]![2]).toBe(zip);
    expect(row("save-backup").textContent).toContain("Every script and asset as a .zip");
  });

  it("shows a failed backup in its row", async () => {
    actions.exportLocalProject.mockResolvedValue(undefined);
    await mountSection();
    await click("Download .zip", section());
    expect(downloads).not.toHaveBeenCalled();
    expect(row("save-backup").textContent).toContain("Could not create the backup. Try again.");
  });

  it("hands a chosen .zip to the Replace request instead of importing it", async () => {
    await mountSection();
    const input = section().querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe(".zip");
    const file = new File(["zip"], "backup.zip");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    expect(actions.requestProjectReplace).toHaveBeenCalledWith(file);
    expect(actions.importLocalProject).not.toHaveBeenCalled();
  });

  it("shows an import in progress and a failed import in the import row", async () => {
    await mountSection();
    await setState("local", "importing");
    expect(row("save-import").textContent).toContain("Replacing the project…");
    expect(button("Choose a .zip…", section())!.disabled).toBe(true);
    await setState("local", "import_error");
    expect(row("save-import").textContent).toContain("Could not import that backup.");
  });

  it("says why an import failed, one sentence per reason, naming the file", async () => {
    await mountSection();
    const failWith = (outcome: object) =>
      act(() => {
        workspace.current = {
          ...workspace.current,
          sync: { status: "import_error", importOutcome: { status: "failed", fileName: "story.zip", ...outcome } } as typeof workspace.current.sync,
        };
      });
    await failWith({ reason: "unreadable_zip" });
    expect(row("save-import").textContent).toContain(
      "“story.zip” is not a .zip this editor can open. Choose a backup made with Download .zip.",
    );
    await failWith({ reason: "storage" });
    expect(row("save-import").textContent).toContain("Could not save “story.zip” on this device. Free some space and try again.");
    await failWith({ reason: "unknown" });
    expect(row("save-import").textContent).toContain("Could not import “story.zip”. Try again, or choose another backup.");
    expect(row("save-import").textContent).not.toContain("Could not import that backup.");
  });

  it("offers Connect Google Drive while signed out and runs the shared sign-in", async () => {
    await mountSection();
    expect(row("save-cloud").textContent).toContain("Optional; nothing here needs an account.");
    expect(button("Disconnect", section())).toBeUndefined();
    await click("Connect Google Drive", section());
    expect(actions.signInToGoogleDrive).toHaveBeenCalledTimes(1);
  });

  it("shows the account and when it last saved to Drive while signed in, with Open and Disconnect", async () => {
    workspace.account.value = account;
    await setState("drive-file", "synced");
    await mountSection();
    const cloud = row("save-cloud");
    expect(cloud.querySelector("[data-account-name]")!.textContent).toBe("Ada Writer");
    expect(cloud.querySelector("[data-drive-status]")!.textContent).toBe("Saved to Google Drive just now");
    expect(button("Connect Google Drive", section())).toBeUndefined();
    await click("Open a project from Drive", section());
    expect(actions.openProjectFromDrive).toHaveBeenCalledTimes(1);
    await click("Disconnect", section());
    expect(actions.signOutOfGoogleDrive).toHaveBeenCalledTimes(1);
  });

  it("follows a sync in progress", async () => {
    workspace.account.value = account;
    await setState("drive-file", "syncing");
    await mountSection();
    expect(row("save-cloud").querySelector("[data-drive-status]")!.textContent).toBe("Syncing…");
  });

  it("says it is offline and keeps Open a project from Drive unavailable", async () => {
    workspace.account.value = { ...account, offline: true };
    await setState("drive-file", "offline");
    await mountSection();
    expect(row("save-cloud").querySelector("[data-drive-status]")!.textContent).toBe(
      "Offline · will sync when connected",
    );
    expect(button("Open a project from Drive", section())!.disabled).toBe(true);
    expect(button("Disconnect", section())!.disabled).toBe(false);
  });
});

describe("the Replace dialog", () => {
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

  const request = {
    fileName: "backup.zip",
    projectName: "Raffles",
    scripts: 3,
    assets: 1,
  };

  it("names what goes, says to back up first, and cancels without importing", async () => {
    await mountSection();
    expect(dialog()).toBeNull();
    await act(async () => {
      workspace.replaceProject.value = request;
    });
    await settle();
    expect(dialog()!.textContent).toContain("Replace this project?");
    expect(dialog()!.textContent).toContain(
      "Everything in Raffles is replaced by the contents of backup.zip: its 3 scripts and 1 asset go, and any file the backup lacks is removed for good. The recycle bin does not keep them.",
    );
    expect(dialog()!.textContent).toContain("To keep what you have, download a backup first.");
    await click("Cancel", dialog()!);
    expect(actions.cancelProjectReplace).toHaveBeenCalledTimes(1);
    expect(actions.confirmProjectReplace).not.toHaveBeenCalled();
  });

  it("closes on Escape as a cancel", async () => {
    await mountSection();
    await act(async () => {
      workspace.replaceProject.value = request;
    });
    await settle();
    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await settle();
    expect(actions.cancelProjectReplace).toHaveBeenCalledTimes(1);
  });

  it("runs the import from Replace project", async () => {
    await mountSection();
    await act(async () => {
      workspace.replaceProject.value = request;
    });
    await settle();
    await click("Replace project", dialog()!);
    expect(actions.confirmProjectReplace).toHaveBeenCalledTimes(1);
  });
});
