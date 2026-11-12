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
  dismiss: vi.fn(),
  openUse: vi.fn(),
  openAsset: vi.fn(),
  setRenameName: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLayout: () => "phone",
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

const { PhoneSearch } = await import(
  "../../src/modules/spark-editor/components/find-references-rename"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { stateForRoute } = await import(
  "../../src/modules/spark-editor/workspace/routes"
);
const { INITIAL_SEARCH, INITIAL_SEARCH_POSITION } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);
const { dismissSnackbar, snackbar } = await import(
  "../../src/modules/spark-editor/utils/snackbar"
);

const MAIN = "file:///p/main.sd";
const range = (line: number, from: number, to: number) => ({
  start: { line, character: from },
  end: { line, character: to },
});

const FIND = {
  ...INITIAL_SEARCH,
  open: true,
  view: "find" as const,
  term: "rumour",
  total: 3,
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let host: HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  workspace.layout.value = "phone";
  workspace.search.value = INITIAL_SEARCH;
  workspace.searchPosition.value = INITIAL_SEARCH_POSITION;
  workspace.scriptMode.value = "reading";
  workspace.current = stateForRoute(
    {
      ...workspace.current,
      screen: {},
      panes: {
        ...workspace.current.panes,
        logic: {
          ...workspace.current.panes.logic,
          view: "list",
          panel: "main",
        },
      },
    },
    "write",
  );
});

afterEach(async () => {
  await act(async () => render(null, host));
  host.remove();
  dismissSnackbar();
  document.body.innerHTML = "";
});

const mount = async (snapshot = FIND) => {
  workspace.search.value = snapshot;
  await act(async () => render(h(PhoneSearch, {}), host));
  await flush();
};

const bar = () => host.querySelector<HTMLFormElement>("[data-find-bar]");
const summary = () => host.querySelector<HTMLElement>("[data-find-summary]")!;
const named = (name: string) =>
  host.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe("the phone's find bar", () => {
  it("renders nothing while the search is closed", async () => {
    await mount(INITIAL_SEARCH);
    expect(bar()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("is one bar with no heading and no modal, the count inside the Find field", async () => {
    workspace.searchPosition.value = { index: 2, total: 3, scripts: 2 };
    await mount();
    expect(dialog()).toBeNull();
    expect(host.querySelector("header")).toBeNull();
    expect(summary().textContent).toBe("2 of 3");
    expect(summary().title).toBe("2 of 3 in 2 scripts");
    expect(summary().parentElement!.querySelector('input[name="search"]')).not.toBeNull();
    expect(
      Array.from(
        host.querySelectorAll<HTMLElement>('[aria-label="How to match"] button'),
      ).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Match case", "Whole words", "Regular expression"]);
  });

  it("says when nothing matches and when a pattern can't be read", async () => {
    await mount({ ...FIND, total: 0 });
    expect(summary().textContent).toBe("No matches");
    expect(summary().getAttribute("data-tone")).toBe("info");
    await act(async () => {
      workspace.search.value = { ...FIND, total: 0, error: "Unterminated group" };
    });
    expect(summary().textContent).toBe("Invalid");
    expect(summary().title).toBe("Unterminated group");
    expect(summary().getAttribute("data-tone")).toBe("error");
    await act(async () => {
      workspace.search.value = { ...FIND, term: "", total: 0 };
    });
    expect(summary().textContent).toBe("");
  });

  it("runs every control on the search", async () => {
    workspace.scriptMode.value = "editing";
    await mount();
    await import("../../src/modules/spark-editor/workspace/Workspace");
    for (const name of ["next", "prev", "replace", "replaceAll", "re", "close"]) {
      await act(async () => named(name).click());
      await flush();
    }
    await vi.waitFor(() => expect(search.close).toHaveBeenCalledTimes(1));
    expect(search.step.mock.calls).toEqual([[], [true]]);
    expect(search.replaceOne).toHaveBeenCalledTimes(1);
    expect(search.replaceAll).toHaveBeenCalledTimes(1);
    expect(search.toggleOption).toHaveBeenCalledWith("regex");
  });

  it("keeps the field focused when a control is pressed", async () => {
    await mount();
    for (const name of ["next", "close", "case"]) {
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      named(name).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it("steps with Enter and Shift+Enter, and closes with Escape", async () => {
    await mount();
    const field = host.querySelector<HTMLInputElement>('input[name="search"]')!;
    expect(document.activeElement).toBe(field);
    const press = (key: string, shiftKey = false) =>
      act(async () => {
        field.dispatchEvent(
          new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
        );
      });
    await press("Enter");
    await press("Enter", true);
    await press("Escape");
    await flush();
    expect(search.step.mock.calls).toEqual([[false], [true]]);
    expect(search.dismiss).toHaveBeenCalledTimes(1);
  });

  it("takes the focus again each time Search is asked for", async () => {
    await mount();
    const field = host.querySelector<HTMLInputElement>('input[name="search"]')!;
    named("close").focus();
    expect(document.activeElement).not.toBe(field);
    await act(async () => {
      workspace.search.value = {
        ...workspace.search.value,
        focusRequest: workspace.search.value.focusRequest + 1,
      };
    });
    expect(document.activeElement).toBe(field);
  });

  it("shows what the search says as a snackbar", async () => {
    await mount({ ...FIND, status: "Replaced 3 matches in 2 scripts" });
    expect(snackbar.value?.message).toBe("Replaced 3 matches in 2 scripts");
  });

  it("closes when the author leaves the Story route", async () => {
    await mount();
    expect(search.close).not.toHaveBeenCalled();
    await act(async () => {
      workspace.current = stateForRoute(workspace.current, "collection");
    });
    await flush();
    expect(bar()).toBeNull();
    expect(search.close).toHaveBeenCalledTimes(1);
  });
});

describe("the phone's References and Rename", () => {
  const subject = { name: "imani", character: false, uri: MAIN, position: range(1, 6, 6).start };
  const references = [
    { uri: MAIN, uses: [{ uri: MAIN, range: range(1, 6, 11), lineText: "  The imani spread." }] },
  ];

  it("opens References as a sheet and closes it once a use is opened", async () => {
    await mount({ ...INITIAL_SEARCH, open: true, view: "references", subject, references });
    expect(bar()).toBeNull();
    expect(dialog()?.textContent).toContain("References to imani");
    expect(dialog()?.querySelector('[aria-label="Close references"]')).not.toBeNull();
    await act(async () => dialog()!.querySelector<HTMLButtonElement>("li button")!.click());
    await vi.waitFor(() => expect(search.close).toHaveBeenCalledTimes(1));
    expect(search.openUse).toHaveBeenCalledWith(references[0]!.uses[0]);
  });

  it("opens Rename as a sheet", async () => {
    await mount({ ...INITIAL_SEARCH, open: true, view: "rename", subject, renameName: "imani" });
    expect(dialog()?.textContent).toContain("Rename imani");
    expect(dialog()?.querySelector("form")).not.toBeNull();
  });
});
