import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({
  setTerm: vi.fn(),
  setReplacement: vi.fn(),
  step: vi.fn(),
  toggleOption: vi.fn(),
  replaceOne: vi.fn(),
  replaceAll: vi.fn(),
  close: vi.fn(),
  openUse: vi.fn(),
  openAsset: vi.fn(),
  setRenameName: vi.fn(),
  rename: vi.fn(),
  openFindFromSelection: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { search },
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { SearchRail } = await import(
  "../../src/modules/spark-editor/components/find-references-rename"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { INITIAL_SEARCH, INITIAL_SEARCH_POSITION } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/scripts/chapter.sd";
const range = (line: number, from: number, to: number) => ({
  start: { line, character: from },
  end: { line, character: to },
});

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let host: HTMLElement;

beforeEach(async () => {
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  workspace.search.value = INITIAL_SEARCH;
  workspace.searchPosition.value = INITIAL_SEARCH_POSITION;
});

afterEach(async () => {
  await act(async () => render(null, host));
  host.remove();
});

const mount = async () => {
  await act(async () => render(h(SearchRail, {}), host));
};

const findSnapshot = {
  ...INITIAL_SEARCH,
  open: true,
  view: "find" as const,
  term: "rumour",
  total: 3,
  options: { matchCase: true, wholeWord: false, regex: false },
  groups: [
    {
      uri: MAIN,
      uses: [{ uri: MAIN, range: range(1, 6, 12), lineText: "  The rumour spread." }],
    },
    {
      uri: CHAPTER,
      uses: [
        { uri: CHAPTER, range: range(1, 4, 10), lineText: "  A rumour, another rumour." },
        { uri: CHAPTER, range: range(1, 20, 26), lineText: "  A rumour, another rumour." },
      ],
    },
  ],
};

describe("the rail's Find view", () => {
  it("renders nothing while the search is closed", async () => {
    await mount();
    expect(host.innerHTML).toBe("");
  });

  it("shows the count, the groups and every match with the current one marked", async () => {
    workspace.search.value = findSnapshot;
    workspace.searchPosition.value = {
      index: 2,
      total: 3,
      scripts: 2,
      current: { uri: CHAPTER, range: range(1, 4, 10) },
    };
    await mount();
    expect(host.querySelector("h2")?.textContent).toBe("Search");
    expect(host.textContent).toContain("2 of 3 matches in 2 scripts");
    expect(Array.from(host.querySelectorAll("section h3")).map((n) => n.textContent)).toEqual([
      "Main(1)",
      "chapter(2)",
    ]);
    const rows = Array.from(host.querySelectorAll("li button"));
    expect(rows.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Line 2: The rumour spread.",
      "Line 2: A rumour, another rumour.",
      "Line 2: A rumour, another rumour.",
    ]);
    expect(rows.map((b) => b.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(rows[0]!.querySelector("mark")?.textContent).toBe("rumour");
  });

  it("presses the switches the search holds and toggles one when clicked", async () => {
    workspace.search.value = findSnapshot;
    await mount();
    const group = host.querySelector('[role="group"][aria-label="How to match"]')!;
    const toggles = Array.from(group.querySelectorAll("button"));
    expect(toggles.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")])).toEqual([
      ["Match case", "true"],
      ["Whole words", "false"],
      ["Regular expression", "false"],
    ]);
    await act(async () => toggles[2]!.click());
    await flush();
    expect(search.toggleOption).toHaveBeenCalledWith("regex");
  });

  it("steps with Enter and Shift+Enter, and closes with Escape", async () => {
    workspace.search.value = findSnapshot;
    await mount();
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Words to find"]')!;
    expect(document.activeElement).toBe(field);
    const press = (key: string, shiftKey = false) =>
      act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
      });
    await press("Enter");
    await press("Enter", true);
    await press("Escape");
    await flush();
    expect(search.step.mock.calls).toEqual([[false], [true]]);
    expect(search.close).toHaveBeenCalledTimes(1);
  });

  it("opens a match's script from its row and replaces from its buttons", async () => {
    workspace.search.value = findSnapshot;
    await mount();
    await act(async () => host.querySelector<HTMLButtonElement>("li button")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Replace all matches"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Replace this match"]')!.click());
    await flush();
    expect(search.openUse).toHaveBeenCalledWith(findSnapshot.groups[0]!.uses[0]);
    expect(search.replaceAll).toHaveBeenCalledTimes(1);
    expect(search.replaceOne).toHaveBeenCalledTimes(1);
  });

  it("says when nothing matches, and gives a pattern's reason in the error colour", async () => {
    workspace.search.value = { ...findSnapshot, groups: [], total: 0 };
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("No matches in any script.");
    workspace.search.value = { ...findSnapshot, groups: [], total: 0, error: "Unterminated group" };
    await flush();
    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toBe("Unterminated group");
    expect(status.getAttribute("data-tone")).toBe("error");
  });

  it("opens Find from Ctrl+F and Cmd+F wherever the focus is", async () => {
    await mount();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      await act(async () => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true, ...modifier }));
      });
    }
    await flush();
    expect(search.openFindFromSelection).toHaveBeenCalledTimes(2);
  });
});

describe("the rail's References and Rename views", () => {
  const subject = { name: "imani", character: true, uri: MAIN, position: range(1, 6, 6).start };
  const references = [
    {
      uri: MAIN,
      uses: [
        { uri: MAIN, range: range(0, 7, 12), lineText: "define imani as character with", declaration: true },
        { uri: MAIN, range: range(4, 2, 7), lineText: "  imani: Hi." },
      ],
    },
  ];

  it("titles the list by the name, marks where it is defined and opens a linked file", async () => {
    workspace.search.value = {
      ...INITIAL_SEARCH,
      open: true,
      view: "references",
      subject,
      references,
      files: ["file:///p/assets/imani.png"],
    };
    await mount();
    expect(host.querySelector("h2")?.textContent).toBe("References to imani");
    expect(host.textContent).toContain("2 references in 1 script");
    const labels = Array.from(host.querySelectorAll("li button")).map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(labels[0]).toBe("Line 1: define imani as character with, where it is defined");
    const file = Array.from(host.querySelectorAll("li button")).find((b) => b.textContent === "imani.png")!;
    await act(async () => (file as HTMLButtonElement).click());
    await flush();
    expect(search.openAsset).toHaveBeenCalledWith("file:///p/assets/imani.png");
  });

  it("reads No script uses <name> yet. when nothing uses it", async () => {
    workspace.search.value = { ...INITIAL_SEARCH, open: true, view: "references", subject: { name: "zadie", character: false } };
    await mount();
    expect(host.textContent).toContain("No script uses zadie yet.");
  });

  it("states what a rename changes, shows a refusal in the error colour and submits the new name", async () => {
    workspace.search.value = {
      ...INITIAL_SEARCH,
      open: true,
      view: "rename",
      subject,
      references,
      files: ["file:///p/assets/imani.png"],
      renameName: "imani",
    };
    await mount();
    expect(host.querySelector("h2")?.textContent).toBe("Rename imani");
    expect(host.querySelector("#rename-status")?.textContent).toBe(
      "Changes 2 uses in 1 script and renames 1 file in your assets. The same word in dialogue and action stays as it is. Cues keep their capitals.",
    );
    workspace.search.value = {
      ...workspace.search.value,
      status: "start is already a name in this story.",
      statusTone: "error",
    };
    await flush();
    const status = host.querySelector("#rename-status")!;
    expect(status.textContent).toBe("start is already a name in this story.");
    expect(status.getAttribute("data-tone")).toBe("error");
    expect(host.querySelector("#rename-new-name")?.getAttribute("aria-invalid")).toBe("true");
    await act(async () => host.querySelector("form")!.requestSubmit());
    await flush();
    expect(search.rename).toHaveBeenCalledTimes(1);
  });
});
