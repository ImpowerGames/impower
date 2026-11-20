import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  exports: [] as { format: string; programs: unknown[] }[],
  downloads: [] as { name: string; type: string; parts: unknown[] }[],
  progress: [] as ((value?: { percentage?: number }) => void)[],
  release: [] as (() => void)[],
  routes: [] as string[],
  unprintable: [] as string[],
}));

const BUNDLE = { files: ["main.sd"] };

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => {
  const run = (format: string) => (programs: unknown[], onProgress: (value?: { percentage?: number }) => void) => {
    calls.exports.push({ format, programs });
    calls.progress.push(onProgress);
    const content = `${format}-content`;
    const result = format === "pdf" ? () => ({ pdf: content, unprintable: calls.unprintable }) : () => content;
    return new Promise((resolve) => calls.release.push(() => resolve(result())));
  };
  return {
    Workspace: {
      fs: { readProjectScriptBundle: async (id: string) => ({ ...BUNDLE, id }) },
      print: { exportPDF: run("pdf"), exportHTML: run("html") },
      window: { navigateTo: (route: string) => calls.routes.push(route) },
    },
  };
});

vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({
  downloadFile: (name: string, type: string, ...parts: unknown[]) => calls.downloads.push({ name, type, parts }),
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { SCREENPLAY_SETTING_KEYS } = await import(
  "../../src/modules/spark-editor/workspace/settings/screenplaySettings"
);
const { SharePage } = await import("../../src/modules/spark-editor/components/share");

let host: HTMLDivElement | undefined;

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SharePage, {}), host!));
};

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const card = (title: string) =>
  [...host!.querySelectorAll("article")].find((el) => el.querySelector("h2")?.textContent === title)!;

const button = (label: string) =>
  [...card("Export a screenplay").querySelectorAll("button")].find((el) => el.textContent?.includes(label))!;

beforeEach(() => {
  localStorage.clear();
  calls.exports.length = 0;
  calls.downloads.length = 0;
  calls.progress.length = 0;
  calls.release.length = 0;
  calls.routes.length = 0;
  calls.unprintable = [];
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "local", name: "My story" },
  };
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetProjectSettings(SCREENPLAY_SETTING_KEYS);
});

describe("the Share page", () => {
  it("draws the four cards with the Coming soon tag on all but the screenplay card", async () => {
    await mount();
    expect(host!.querySelector("h1")!.textContent).toBe("Share your story");
    const titles = [...host!.querySelectorAll("article h2")].map((el) => el.textContent);
    expect(titles).toEqual(["Export a game", "Export a screenplay", "Make it together", "Publish it online"]);
    expect(card("Export a screenplay").textContent).not.toContain("Coming soon");
    for (const title of ["Export a game", "Make it together", "Publish it online"]) {
      expect(card(title).textContent).toContain("Coming soon");
      expect(card(title).closest("button")).toBeNull();
    }
    const link = card("Export a game").querySelector<HTMLAnchorElement>('a[href*="marketplace.visualstudio.com"]')!;
    expect(link.textContent).toContain("Open your project in VS Code");
  });

  it("goes back to the story from its Back to story action", async () => {
    await mount();
    const back = [...host!.querySelectorAll("button")].find((el) => el.textContent?.includes("Back to story"))!;
    await act(async () => back.click());
    await settle();
    expect(calls.routes).toEqual(["story"]);
  });

  it("names the screenplay settings and follows them when they change", async () => {
    await mount();
    const summary = () => card("Export a screenplay").querySelector("[data-screenplay-summary]")!.textContent;
    expect(summary()).toBe("US Letter · Title page · No scene numbers");
    await act(async () => workspaceSettings.setProjectSetting("screenplayPaperSize", "a4"));
    expect(summary()).toBe("A4 · Title page · No scene numbers");
    expect(
      card("Export a screenplay").querySelector<HTMLAnchorElement>('a[href="#settings?section=screenplay-settings"]'),
    ).not.toBeNull();
  });

  it.each([
    ["Download PDF", "pdf", "My story.pdf", "application/pdf"],
    ["Download HTML", "html", "My story.html", "text/html"],
  ])("%s exports the project's programs with progress and downloads a file named after the project", async (label, format, name, type) => {
    await mount();
    await act(async () => button(label).click());
    await settle();
    expect(calls.exports).toEqual([{ format, programs: [{ ...BUNDLE, id: "local" }] }]);
    expect(button(label).disabled).toBe(true);
    await act(async () => calls.progress[0]!({ percentage: 40 }));
    const bar = card("Export a screenplay").querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    await act(async () => calls.release[0]!());
    await settle();
    expect(calls.downloads).toEqual([{ name, type, parts: [`${format}-content`] }]);
    expect(button(label).disabled).toBe(false);
    expect(card("Export a screenplay").querySelector('[role="progressbar"]')).toBeNull();
  });

  const notice = () => document.querySelector<HTMLElement>("[data-unprintable-notice]");

  const exportPdf = async () => {
    await act(async () => button("Download PDF").click());
    await settle();
    await act(async () => calls.release[0]!());
    await settle();
  };

  it("names the characters the PDF prints blank under the Download buttons, outside the page's flow", async () => {
    calls.unprintable = ["日", "本", "Ω"];
    await mount();
    const flow = () => [...card("Export a screenplay").querySelectorAll("*")].map((el) => el.tagName);
    const before = flow();
    await exportPdf();
    expect(calls.downloads).toEqual([{ name: "My story.pdf", type: "application/pdf", parts: ["pdf-content"] }]);
    expect(notice()!.textContent).toBe(
      "Some characters can't be printed in the screenplay font and are blank in the PDF: 日 本 Ω",
    );
    expect(host!.contains(notice())).toBe(false);
    expect(flow()).toEqual(before);
  });

  it("shows no notice for a script the font covers", async () => {
    await mount();
    await exportPdf();
    expect(calls.downloads).toHaveLength(1);
    expect(notice()).toBeNull();
  });

  it("clears the notice when the next export starts", async () => {
    calls.unprintable = ["日"];
    await mount();
    await exportPdf();
    expect(notice()).not.toBeNull();
    calls.unprintable = [];
    await act(async () => button("Download PDF").click());
    await settle();
    expect(notice()).toBeNull();
    await act(async () => calls.release[1]!());
    await settle();
    expect(notice()).toBeNull();
  });
});
