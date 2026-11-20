import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import populateDocument from "../../src/build/populateDocument";

vi.mock(
  "../../src/modules/spark-editor/components/desktop-shell/workspaceWindow",
  () => ({ withWindow: async () => {} }),
);

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
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: WorkspaceShell } =
  await import("../../src/modules/spark-editor/components/desktop-shell/WorkspaceShell");

const DOCUMENT_HTML = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/public/document.html"),
  "utf8",
);

const SECTIONING = "article, aside, main, nav, section";

const roleOf = (el: Element): string | null => {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  switch (el.tagName.toLowerCase()) {
    case "main":
      return "main";
    case "nav":
      return "navigation";
    case "header":
      return el.parentElement?.closest(SECTIONING) ? null : "banner";
    case "footer":
      return el.parentElement?.closest(SECTIONING) ? null : "contentinfo";
    case "aside":
      return el.parentElement?.closest("article, aside, nav, section") &&
        !el.hasAttribute("aria-label")
        ? null
        : "complementary";
    default:
      return null;
  }
};

const landmarks = (role: string) =>
  [...document.body.querySelectorAll("*")].filter(
    (el) => roleOf(el) === role && !el.closest("[hidden]"),
  );

const mountPage = async (phone: boolean) => {
  const page = new DOMParser().parseFromString(
    populateDocument(DOCUMENT_HTML, { html: '<div id="root"></div>' }),
    "text/html",
  );
  document.body.replaceChildren(
    ...[...page.body.children].filter((el) => el.tagName !== "SCRIPT"),
  );
  const root = document.getElementById("root")!;
  await act(async () =>
    render(
      h(WorkspaceShell, { phone }, h("div", { "data-route-content": "" })),
      root,
    ),
  );
};

afterEach(() => {
  const root = document.getElementById("root");
  if (root) render(null, root);
  document.body.replaceChildren();
});

describe.each([
  ["desktop", false],
  ["phone", true],
])("the %s editor page's landmarks", (_name, phone) => {
  it("has one banner, the title bar, outside the main landmark", async () => {
    await mountPage(phone);
    const banners = landmarks("banner");
    expect(banners.map((el) => el.tagName.toLowerCase())).toEqual(["header"]);
    expect(banners[0]!.closest("main")).toBeNull();
  });

  it("has one main landmark, holding the route's content and none of the shell's bars", async () => {
    await mountPage(phone);
    const mains = landmarks("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]!.querySelector("[data-route-content]")).not.toBeNull();
    for (const role of ["banner", "navigation", "complementary"]) {
      expect(
        landmarks(role).filter((el) => mains[0]!.contains(el)),
        `${role} landmarks inside main`,
      ).toEqual([]);
    }
  });

  it("keeps its navigation landmarks", async () => {
    await mountPage(phone);
    expect(landmarks("navigation").length).toBeGreaterThan(0);
  });
});
