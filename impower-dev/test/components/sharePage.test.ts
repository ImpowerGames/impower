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
  zips: [] as ((result: boolean | Error) => void)[],
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

vi.mock("../../src/modules/spark-editor/utils/downloadProjectZip", () => ({
  downloadProjectZip: () =>
    new Promise<boolean>((resolve, reject) =>
      calls.zips.push((result) => (result instanceof Error ? reject(result) : resolve(result))),
    ),
}));

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
const { announcement } = await import("../../../packages/impower-ui/src/hooks/useAnnouncer");

let host: HTMLDivElement | undefined;

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SharePage, {}), host!));
};

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const card = (title: string) =>
  [...host!.querySelectorAll("article")].find((el) => el.querySelector("h2, h3")?.textContent === title)!;

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
  calls.zips.length = 0;
  announcement.value = "";
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
  it("draws no title or intro line and keeps the section's accessible name", async () => {
    await mount();
    const section = host!.querySelector<HTMLElement>("#share-page")!;
    expect(section.getAttribute("aria-label")).toBe("Share");
    expect(section.querySelector("h1")!.classList).toContain("sr-only");
    expect(section.textContent).not.toContain("Share your story");
    expect(section.textContent).not.toContain("Collaborate with others. Publish it online.");
    expect(section.textContent).not.toContain("Back to story");
  });

  it("starts with the Export a screenplay and Export your project cards, then three Coming soon rows, in one column", async () => {
    await mount();
    const articles = [...host!.querySelectorAll("article")];
    expect(articles.map((el) => el.querySelector("h2, h3")!.textContent)).toEqual([
      "Export a screenplay",
      "Export your project",
      "Export a game",
      "Make it together",
      "Publish it online",
    ]);
    expect(host!.querySelector("#share-page h1 + *")!.contains(card("Export a screenplay"))).toBe(true);
    expect(host!.querySelector("#share-page .grid")).toBeNull();
    expect(card("Export a screenplay").parentElement!.classList).toContain("flex-col");
    const soon = host!.querySelector<HTMLElement>('section[aria-labelledby="share-coming-soon"]')!;
    expect(soon.querySelector("h2")!.textContent).toBe("Coming soon");
    expect([...soon.querySelectorAll("article h3")].map((el) => el.textContent)).toEqual([
      "Export a game",
      "Make it together",
      "Publish it online",
    ]);
  });

  it("gives the Coming soon rows no pointer or keyboard action and no button or link role", async () => {
    await mount();
    for (const title of ["Export a game", "Make it together", "Publish it online"]) {
      const row = card(title);
      expect(row.querySelector("a, button, [role], [tabindex]")).toBeNull();
      expect(row.getAttribute("role")).toBeNull();
      expect(row.hasAttribute("tabindex")).toBe(false);
      expect(row.closest("a, button")).toBeNull();
    }
  });

  it("puts Open your project in VS Code on the Export your project card and nowhere else", async () => {
    await mount();
    const links = [...host!.querySelectorAll<HTMLAnchorElement>("a")].filter((el) =>
      el.textContent?.includes("Open your project in VS Code"),
    );
    expect(links).toHaveLength(1);
    expect(card("Export your project").contains(links[0]!)).toBe(true);
    expect(links[0]!.href).toContain("marketplace.visualstudio.com");
  });

  it("lays the screenplay downloads out side by side, PDF filled and HTML outlined", async () => {
    await mount();
    const row = button("Download PDF").parentElement!;
    expect(row).toBe(button("Download HTML").parentElement);
    expect(row.classList).toContain("flex");
    expect(button("Download PDF").className).toContain("bg-accent");
    expect(button("Download HTML").className).toContain("border-field-edge");
    expect(button("Download HTML").className).not.toContain("bg-accent");
  });

  it("names the screenplay settings and follows them when they change", async () => {
    await mount();
    const summary = () => card("Export a screenplay").querySelector("[data-screenplay-summary]")!.textContent;
    expect(summary()).toBe("US Letter · Title page · No scene numbers");
    await act(async () => workspaceSettings.setProjectSetting("screenplayPaperSize", "a4"));
    expect(summary()).toBe("A4 · Title page · No scene numbers");
    const change = card("Export a screenplay").querySelector<HTMLAnchorElement>(
      'a[href="#settings?section=screenplay-settings"]',
    )!;
    expect(change.textContent).toBe("Change");
    expect(change.className).toContain("pointer-coarse:after:-inset-y-[11px]");
    expect(change.parentElement).toBe(card("Export a screenplay").querySelector("[data-screenplay-summary]")!.parentElement);
    expect(card("Export a screenplay").textContent).not.toContain("Screenplay settings");
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

  const zipButton = () =>
    [...card("Export your project").querySelectorAll("button")].find((el) => el.textContent?.includes("Download .zip"))!;
  const zipStatus = () => card("Export your project").querySelector<HTMLElement>("[data-zip-status]");

  it("Download .zip runs the Settings backup download and shows a working state while it prepares", async () => {
    await mount();
    expect(zipButton().className).toContain("bg-accent");
    expect(zipStatus()).toBeNull();
    await act(async () => zipButton().click());
    await settle();
    expect(calls.zips).toHaveLength(1);
    expect(zipButton().disabled).toBe(true);
    expect(zipStatus()!.textContent).toBe("Preparing the .zip…");
    await act(async () => calls.zips[0]!(true));
    await settle();
    expect(zipButton().disabled).toBe(false);
    expect(zipStatus()).toBeNull();
    expect(announcement.value).toBe("");
  });

  it.each([
    ["finds no project to archive", false],
    ["throws", new Error("storage unavailable")],
  ] as const)("Download .zip says it failed when the download %s", async (_case, result) => {
    await mount();
    await act(async () => zipButton().click());
    await settle();
    await act(async () => calls.zips[0]!(result));
    await settle();
    expect(zipButton().disabled).toBe(false);
    expect(zipStatus()!.textContent).toBe("Could not create the .zip. Try again.");
    expect(zipStatus()!.className).toContain("text-error-strong");
    expect(announcement.value).toBe("Could not create the .zip. Try again.");
  });
});
