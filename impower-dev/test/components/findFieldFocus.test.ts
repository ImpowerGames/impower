import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { search: {} },
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
const { default: PhoneFindBar } = await import(
  "../../src/modules/spark-editor/components/find-references-rename/PhoneFindBar"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { INITIAL_SEARCH, INITIAL_SEARCH_POSITION } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);
type SearchSnapshot = typeof INITIAL_SEARCH;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

let host: HTMLElement;
let script: HTMLTextAreaElement;

beforeEach(() => {
  workspace.search.value = INITIAL_SEARCH;
  workspace.searchPosition.value = INITIAL_SEARCH_POSITION;
  script = document.body.appendChild(document.createElement("textarea"));
  script.value = "Hello";
  host = document.body.appendChild(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => render(null, host));
  document.body.innerHTML = "";
});

const typeIntoFocused = (text: string) => {
  for (const character of text) {
    const target = document.activeElement as HTMLInputElement;
    const from = target.selectionStart ?? target.value.length;
    const to = target.selectionEnd ?? from;
    target.value = target.value.slice(0, from) + character + target.value.slice(to);
    target.setSelectionRange(from + 1, from + 1);
  }
};

const openThenType = async (patch: Partial<SearchSnapshot>, text: string) => {
  script.focus();
  await nextTask();
  workspace.search.value = {
    ...workspace.search.peek(),
    open: true,
    status: "",
    focusRequest: workspace.search.peek().focusRequest + 1,
    ...patch,
  };
  await nextTask();
  typeIntoFocused(text);
};

const field = (name: string) =>
  host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

describe("the first key after Search opens", () => {
  describe.each([
    ["the rail", SearchRail],
    ["the phone's find bar", PhoneFindBar],
  ])("in %s", (_, Surface) => {
    it.each([
      ["an empty query", ""],
      ["a prefilled query", "rumour"],
    ])("lands in Find's field over %s", async (_, term) => {
      if (Surface === PhoneFindBar) {
        workspace.search.value = { ...INITIAL_SEARCH, open: true, view: "find" };
      }
      await act(async () => render(h(Surface, {}), host));
      await openThenType({ view: "find", term }, "Alice!");
      expect(field("search").value).toBe("Alice!");
      expect(script.value).toBe("Hello");
    });
  });

  it("lands in Rename's field over the name", async () => {
    await act(async () => render(h(SearchRail, {}), host));
    await openThenType(
      {
        view: "rename",
        subject: { name: "imani", character: true, uri: "file:///p/main.sd", position: { line: 1, character: 6 } },
        renameName: "imani",
      },
      "Robin",
    );
    expect(host.querySelector<HTMLInputElement>("#rename-new-name")!.value).toBe("Robin");
    expect(script.value).toBe("Hello");
  });
});
