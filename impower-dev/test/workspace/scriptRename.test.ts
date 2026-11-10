import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {},
}));

const { checkName } = await import(
  "../../src/modules/spark-editor/utils/nameRules"
);
const { default: WorkspaceWindow } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceWindow"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { snackbar } = await import(
  "../../src/modules/spark-editor/utils/snackbar"
);

const ROOT = "file:///local/";

const makeFs = (paths: string[], referencesUpdated = 0) => ({
  getFiles: vi.fn(async () =>
    Object.fromEntries(paths.map((path) => [`${ROOT}${path}`, {}])),
  ),
  getRelativePath: (_projectId: string, uri: string) =>
    uri.slice(ROOT.length),
  getFileUri: (_projectId: string, path: string) => `${ROOT}${path}`,
  renameFileWithReferences: vi.fn(async () => ({
    referencesUpdated,
    scriptsAffected: referencesUpdated ? 1 : 0,
  })),
  writeProjectMetadata: vi.fn(async () => {}),
});

describe("checkName", () => {
  it("keeps the old name for an empty or unchanged draft", () => {
    expect(checkName("   ", "intro")).toEqual({ status: "empty" });
    expect(checkName(" intro ", "intro")).toEqual({ status: "unchanged" });
  });

  it("refuses a name another file already has, ignoring case", () => {
    expect(checkName("Outro", "intro", ["outro"])).toEqual({
      status: "collision",
      name: "Outro",
    });
  });

  it("lets a script change only the case of its own name", () => {
    expect(checkName("Intro", "intro", ["outro"])).toEqual({
      status: "renamed",
      name: "Intro",
    });
  });

  it("refuses a slash, which would move the file into a folder", () => {
    expect(checkName("act1/intro", "intro")).toEqual({ status: "invalid" });
  });
});

describe("WorkspaceWindow.renameScript", () => {
  let win: InstanceType<typeof WorkspaceWindow>;
  let fs: ReturnType<typeof makeFs>;

  const open = (paths: string[], filename: string, referencesUpdated = 0) => {
    fs = makeFs(paths, referencesUpdated);
    win = new WorkspaceWindow({ fs, sync: {} } as never);
    vi.spyOn(win, "recordScriptChange").mockResolvedValue(undefined as never);
    win.openFileEditor(filename);
  };

  beforeEach(() => {
    localStorage.clear();
    snackbar.value = null;
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "local" },
    };
  });

  afterEach(() => {
    win?.dispose();
  });

  const openFilename = () =>
    workspace.current.panes.logic.panels.scripts?.activeEditor?.filename;

  it("moves the file through the rename with references and follows it in the editor", async () => {
    open(["main.sd", "scripts/intro.sd"], "scripts/intro.sd");
    await expect(win.renameScript("scripts/intro.sd", "Opening")).resolves.toEqual({
      status: "renamed",
      name: "Opening",
    });
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(
      "local",
      "scripts/intro.sd",
      "scripts/Opening.sd",
    );
    expect(openFilename()).toBe("scripts/Opening.sd");
    expect(snackbar.value?.message).toBe("Renamed to Opening.");
  });

  it("says when the rename updated the includes that link to the script", async () => {
    open(["main.sd", "scripts/intro.sd"], "scripts/intro.sd", 2);
    await win.renameScript("scripts/intro.sd", "Opening");
    expect(snackbar.value?.message).toBe(
      "Renamed to Opening. Linked includes were updated.",
    );
  });

  it("restores a colliding name with a toast and moves nothing", async () => {
    open(["main.sd", "scripts/intro.sd", "scripts/outro.sd"], "scripts/intro.sd");
    await expect(win.renameScript("scripts/intro.sd", "Outro")).resolves.toEqual({
      status: "collision",
      name: "Outro",
    });
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(openFilename()).toBe("scripts/intro.sd");
    expect(snackbar.value?.message).toBe("A script named Outro already exists.");
  });

  it("allows a name a script in another folder already has", async () => {
    open(["scripts/intro.sd", "scripts/act1/outro.sd"], "scripts/intro.sd");
    await win.renameScript("scripts/intro.sd", "outro");
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(
      "local",
      "scripts/intro.sd",
      "scripts/outro.sd",
    );
  });

  it("restores an empty name with a toast, without reading the project", async () => {
    open(["scripts/intro.sd"], "scripts/intro.sd");
    await expect(win.renameScript("scripts/intro.sd", "  ")).resolves.toEqual({
      status: "empty",
    });
    expect(fs.getFiles).not.toHaveBeenCalled();
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(snackbar.value?.message).toBe("A script needs a name.");
  });

  it("keeps an unchanged name quietly, as Escape does", async () => {
    open(["scripts/intro.sd"], "scripts/intro.sd");
    await expect(win.renameScript("scripts/intro.sd", "intro")).resolves.toEqual({
      status: "unchanged",
    });
    expect(fs.getFiles).not.toHaveBeenCalled();
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(snackbar.value).toBeNull();
  });

  it("refuses a name with a slash with a toast", async () => {
    open(["scripts/intro.sd"], "scripts/intro.sd");
    await expect(win.renameScript("scripts/intro.sd", "a/b")).resolves.toEqual({
      status: "invalid",
    });
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
    expect(snackbar.value?.message).toBe("A script name can't contain a slash.");
  });

  it("follows a nested script renamed to main in the scripts editor and leaves Main alone", async () => {
    open(["main.sd", "scripts/intro.sd"], "scripts/intro.sd");
    await win.renameScript("scripts/intro.sd", "main");
    expect(fs.renameFileWithReferences).toHaveBeenCalledWith(
      "local",
      "scripts/intro.sd",
      "scripts/main.sd",
    );
    expect(openFilename()).toBe("scripts/main.sd");
    expect(workspace.current.panes.logic.panels.main?.activeEditor?.filename).toBe(
      "main.sd",
    );
  });

  it("identifies Main by its root path alone, from a filename or a uri", () => {
    open(["main.sd"], "main.sd");
    expect(win.getPanelType("main.sd")).toBe("main");
    expect(win.getPanelType(`${ROOT}main.sd`)).toBe("main");
    expect(win.getPanelType("scripts/main.sd")).toBe("scripts");
    expect(win.getPanelType(`${ROOT}scripts/main.sd`)).toBe("scripts");
  });

  it("keeps the script list when Browse scripts is pressed while the rename is still moving the file", async () => {
    open(["main.sd", "scripts/intro.sd"], "scripts/intro.sd");
    let finishMove = () => {};
    fs.renameFileWithReferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishMove = () => resolve({ referencesUpdated: 0, scriptsAffected: 0 });
        }),
    );
    const pending = win.renameScript("scripts/intro.sd", "Opening");
    await vi.waitFor(() => expect(fs.renameFileWithReferences).toHaveBeenCalled());
    win.browseScripts();
    finishMove();
    await pending;
    const editor = workspace.current.panes.logic.panels.scripts?.activeEditor;
    expect(workspace.current.panes.logic.view).toBe("scripts");
    expect(editor?.filename).toBe("scripts/Opening.sd");
  });

  it("leaves another script the writer opened during the rename on screen", async () => {
    open(["main.sd", "scripts/intro.sd", "scripts/outro.sd"], "scripts/intro.sd");
    let finishMove = () => {};
    fs.renameFileWithReferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishMove = () => resolve({ referencesUpdated: 0, scriptsAffected: 0 });
        }),
    );
    const pending = win.renameScript("scripts/intro.sd", "Opening");
    await vi.waitFor(() => expect(fs.renameFileWithReferences).toHaveBeenCalled());
    win.openFileEditor("scripts/outro.sd");
    finishMove();
    await pending;
    expect(openFilename()).toBe("scripts/outro.sd");
    expect(workspace.current.panes.logic.panels.scripts?.activeEditor?.open).toBe(true);
  });

  it("follows the renamed script with the selection and scroll its editor reported during the rename", async () => {
    open(["main.sd", "scripts/intro.sd"], "scripts/intro.sd");
    const at = (line: number) => ({
      start: { line, character: 0 },
      end: { line, character: 0 },
    });
    let finishMove = () => {};
    fs.renameFileWithReferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishMove = () => resolve({ referencesUpdated: 0, scriptsAffected: 0 });
        }),
    );
    const pending = win.renameScript("scripts/intro.sd", "Opening");
    await vi.waitFor(() => expect(fs.renameFileWithReferences).toHaveBeenCalled());
    const textDocument = { uri: `${ROOT}scripts/intro.sd` };
    win["handleSelectedEditor"](
      SelectedEditorMessage.type.notification({
        textDocument,
        selectedRange: at(6),
        docChanged: false,
        hasFocus: true,
      }),
    );
    win["handleScrolledEditor"](
      ScrolledEditorMessage.type.notification({
        textDocument,
        visibleRange: at(4),
        target: "element",
      }),
    );
    finishMove();
    await pending;
    const editor = workspace.current.panes.logic.panels.scripts?.activeEditor;
    expect(editor?.filename).toBe("scripts/Opening.sd");
    expect(editor?.selectedRange).toEqual(at(6));
    expect(editor?.visibleRange).toEqual(at(4));
    expect(editor?.focused).toBe(true);
  });

  it("never renames Main", async () => {
    open(["main.sd"], "main.sd");
    await expect(win.renameScript("main.sd", "Start")).resolves.toEqual({
      status: "unchanged",
    });
    expect(fs.renameFileWithReferences).not.toHaveBeenCalled();
  });
});
