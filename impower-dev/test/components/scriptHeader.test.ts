import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  renames: [] as [string, string][],
  commands: [] as [string, string][],
  browsed: 0,
  result: { status: "renamed" } as { status: string },
}));
const layout = vi.hoisted(() => ({ value: "desktop" }));

vi.mock("@impower/impower-ui/layout", () => ({
  useLayout: () => layout.value,
  useCoarsePointer: () => false,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      renameScript: async (filename: string, draft: string) => {
        calls.renames.push([filename, draft]);
        return calls.result;
      },
      executeEditorCommand: (filename: string, command: string) => {
        calls.commands.push([filename, command]);
      },
      browseScripts: () => {
        calls.browsed += 1;
      },
    },
  },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: workspaceSettings, PREFERENCES_STORAGE_KEY, WorkspaceSettings } =
  await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");
const { default: ScriptHeader } =
  await import("../../src/modules/spark-editor/components/script-header/ScriptHeader");

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async (props: Record<string, unknown>) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ScriptHeader, props), host!));
  return host;
};

const field = () => host!.querySelector<HTMLInputElement>("input[data-script-name]")!;

const type = async (value: string) => {
  await act(async () => {
    field().focus();
    field().value = value;
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const key = async (name: string) => {
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
  await settle();
};

const button = (label: string) =>
  Array.from(host!.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );

beforeEach(() => {
  localStorage.clear();
  calls.renames.length = 0;
  calls.commands.length = 0;
  calls.browsed = 0;
  calls.result = { status: "renamed" };
  layout.value = "desktop";
  workspaceSettings.setPreference("lineNumbers", false);
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local" },
    debug: { ...workspace.current.debug, diagnosticsSummary: {} },
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("ScriptHeader name field", () => {
  it("commits the typed name through the workspace's rename on Enter", async () => {
    await mount({ filename: "scripts/intro.sd" });
    expect(field().value).toBe("intro");
    await type("Opening");
    await key("Enter");
    expect(calls.renames).toEqual([["scripts/intro.sd", "Opening"]]);
  });

  it("commits on blur", async () => {
    await mount({ filename: "scripts/intro.sd" });
    await type("Opening");
    await act(async () => field().blur());
    await settle();
    expect(calls.renames).toEqual([["scripts/intro.sd", "Opening"]]);
  });

  it("restores the old name on Escape and renames nothing", async () => {
    await mount({ filename: "scripts/intro.sd" });
    await type("Opening");
    calls.result = { status: "unchanged" };
    await key("Escape");
    expect(field().value).toBe("intro");
    expect(calls.renames).toEqual([["scripts/intro.sd", "intro"]]);
  });

  it.each(["empty", "collision", "invalid"])(
    "restores the old name when the rename is refused as %s",
    async (status) => {
      await mount({ filename: "scripts/intro.sd" });
      await type(status === "empty" ? "" : "outro");
      calls.result = { status };
      await key("Enter");
      expect(field().value).toBe("intro");
    },
  );

  it("draws Main's name as a heading, not a field", async () => {
    await mount({ filename: "main.sd" });
    expect(host!.querySelector("input")).toBeNull();
    expect(host!.querySelector("[data-script-name]")!.textContent).toBe("Main");
  });

  it.each(["phone", "tablet", "desktop"])(
    "on %s, draws the name's box around a hit area the shared inline-hit rule centres",
    async (value) => {
      layout.value = value;
      await mount({ filename: "scripts/act1/intro.sd" });
      const box = field().parentElement!;
      expect(box.hasAttribute("data-script-name-box")).toBe(true);
      expect(box.classList.contains("inline-hit")).toBe(true);
      expect(box.classList.contains("h-[calc(1lh+4px)]")).toBe(true);
      expect(field().className).not.toMatch(/\bborder(?!-0)\b|\bh-/);
    },
  );

  it("names the script's folder beneath it", async () => {
    await mount({ filename: "scripts/act1/intro.sd" });
    expect(host!.querySelector("[data-script-folder]")!.textContent).toBe("scripts/act1");
  });

  it("on a phone, swaps Browse scripts for Done while the name is focused", async () => {
    layout.value = "phone";
    await mount({ filename: "scripts/intro.sd" });
    expect(button("Browse scripts")).toBeTruthy();
    await act(async () => field().focus());
    expect(button("Browse scripts")).toBeUndefined();
    expect(button("Keep the script's name")).toBeTruthy();
    await act(async () => field().blur());
    await settle();
    expect(button("Browse scripts")).toBeTruthy();
  });
});

describe("ScriptHeader rail toggle", () => {
  it("shows line numbers through the user's preference, which survives a reload", async () => {
    await mount({ filename: "main.sd" });
    const toggle = button("Show line numbers")!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(workspaceSettings.scriptAppearance.value.lineNumbers).toBe(true);
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!).lineNumbers).toBe(true);
    const reloaded = new WorkspaceSettings(signal("local"), localStorage);
    expect(reloaded.preferences.value.lineNumbers).toBe(true);
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("starts with line numbers hidden for a user who never chose", () => {
    localStorage.clear();
    const fresh = new WorkspaceSettings(signal("local"), localStorage);
    expect(fresh.preferences.value.lineNumbers).toBe(false);
  });
});

describe("ScriptHeader status and Browse scripts", () => {
  it("draws a clean script's book in the accent, and it still opens the problems panel", async () => {
    await mount({ filename: "scripts/intro.sd" });
    const status = button("Show problems")!;
    expect(status.getAttribute("data-script-status")).toBe("clean");
    expect(status.querySelector("svg")!.getAttribute("class")).toBe("text-accent");
    await act(async () => status.click());
    await settle();
    expect(calls.commands).toEqual([["scripts/intro.sd", "problems"]]);
  });

  it("colours the book by the worst problem and opens the problems panel on press", async () => {
    workspace.current = {
      ...workspace.current,
      debug: {
        ...workspace.current.debug,
        diagnosticsSummary: {
          "file://local/scripts/intro.sd": { errors: 1, warnings: 2, infos: 0 },
        },
      },
    } as typeof workspace.current;
    await mount({ filename: "scripts/intro.sd" });
    const status = button("Show problems")!;
    expect(status.getAttribute("data-script-status")).toBe("problems");
    expect(status.querySelector("svg")!.getAttribute("class")).toBe("text-error-strong");
    await act(async () => status.click());
    await settle();
    expect(calls.commands).toEqual([["scripts/intro.sd", "problems"]]);
  });

  it("opens the script list from Browse scripts", async () => {
    await mount({ filename: "main.sd" });
    await act(async () => button("Browse scripts")!.click());
    await settle();
    expect(calls.browsed).toBe(1);
  });
});
