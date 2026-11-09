import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { INITIAL_SEARCH } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);
const { default: PhoneFindBar } = await import(
  "../../src/modules/spark-editor/components/find-references-rename/PhoneFindBar"
);
const { default: RenameView } = await import(
  "../../src/modules/spark-editor/components/find-references-rename/RenameView"
);

let host: HTMLDivElement | undefined;

const mount = async (view: () => unknown) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(view as never, null), host!));
  return host;
};

const setMode = async (mode: "reading" | "editing") => {
  await act(async () => {
    workspace.scriptMode.value = mode;
  });
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host = undefined;
  }
  document.body.innerHTML = "";
  workspace.search.value = INITIAL_SEARCH;
});

describe("the phone find bar", () => {
  it("keeps the Replace row, disabled with Tap Edit to replace., while reading and enabled while editing", async () => {
    workspace.search.value = { ...INITIAL_SEARCH, open: true, view: "find" };
    await setMode("reading");
    const bar = await mount(PhoneFindBar);
    const field = bar.querySelector<HTMLInputElement>('input[name="replace"]')!;
    const one = bar.querySelector<HTMLButtonElement>('button[name="replace"]')!;
    const all = bar.querySelector<HTMLButtonElement>('button[name="replaceAll"]')!;
    expect([field.disabled, one.disabled, all.disabled]).toEqual([true, true, true]);
    expect(field.placeholder).toBe("Tap Edit to replace.");
    expect([one.title, all.title]).toEqual(["Tap Edit to replace.", "Tap Edit to replace."]);

    await setMode("editing");
    expect([field.disabled, one.disabled, all.disabled]).toEqual([false, false, false]);
    expect(field.placeholder).toBe("Replace");
  });
});

describe("the Rename view", () => {
  it("disables Rename with Tap Edit to rename. while reading and enables it while editing", async () => {
    workspace.search.value = {
      ...INITIAL_SEARCH,
      open: true,
      view: "rename",
      subject: { name: "imani", character: true },
      renameName: "imani",
    };
    await setMode("reading");
    const view = await mount(RenameView);
    const submit = view.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(view.querySelector("#rename-status")!.textContent).toBe("Tap Edit to rename.");

    await setMode("editing");
    expect(submit.disabled).toBe(false);
    expect(view.querySelector("#rename-status")!.textContent).not.toBe("Tap Edit to rename.");
  });

  it("shows Tap Edit to rename. over an earlier rename's error once reading starts", async () => {
    workspace.search.value = {
      ...INITIAL_SEARCH,
      open: true,
      view: "rename",
      subject: { name: "imani", character: true },
      renameName: "zadie",
      status: "zadie is already a name in this story.",
      statusTone: "error",
    };
    await setMode("editing");
    const view = await mount(RenameView);
    const status = view.querySelector("#rename-status")!;
    expect(status.textContent).toBe("zadie is already a name in this story.");

    await setMode("reading");
    expect(status.textContent).toBe("Tap Edit to rename.");
    expect(status.getAttribute("data-tone")).toBe("info");
  });
});
