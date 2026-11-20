import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import populateDocument from "../../src/build/populateDocument";

vi.mock("../../src/modules/spark-editor/components/preview/Preview", () => ({
  default: () => h("div", { "data-player": "" }),
}));
vi.mock("../../src/modules/spark-editor/components/logic/Logic", () => ({
  default: () => h("div", { "data-route": "logic" }),
}));
vi.mock("../../src/modules/spark-editor/components/assets/Assets", () => ({
  default: () => h("div", { "data-route": "assets" }),
}));
vi.mock("../../src/modules/spark-editor/components/share/SharePage", () => ({
  default: () => h("div", { "data-route": "share" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone",
  () => ({ default: () => null }),
);
vi.mock("../../src/modules/spark-editor/workspace/Workspace", async () => {
  const { default: workspace } =
    await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const { stateForRoute } =
    await import("../../src/modules/spark-editor/workspace/routes");
  const { shellWindow } = await import("../shellWindow");
  return {
    Workspace: {
      sync: { google: { getCurrentAccount: async () => null } },
      window: shellWindow(() => workspace, {
        navigateTo: (route: Parameters<typeof stateForRoute>[1]) => {
          workspace.current = stateForRoute(workspace.current, route);
        },
        closeSettings: () => {
          workspace.current = stateForRoute(workspace.current, "story");
        },
      }),
    },
  };
});

let width = 1440;
const listeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) => {
    const minWidth = /\(min-width: (\d+)px\)/.exec(query);
    return {
      get matches() {
        return minWidth ? width >= Number(minWidth[1]) : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
const { default: MainWindow } =
  await import("../../src/modules/spark-editor/components/main-window/MainWindow");

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

const landmarkOf = (el: Element) => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const role = roleOf(node);
    if (role) return { role, label: node.getAttribute("aria-label") };
  }
  return null;
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

const mountPage = async (
  pageWidth: number,
  route: Parameters<typeof stateForRoute>[1],
) => {
  width = pageWidth;
  listeners.forEach((listener) => listener());
  workspace.current = stateForRoute(workspace.current, route);
  const page = new DOMParser().parseFromString(
    populateDocument(DOCUMENT_HTML, { html: '<div id="root"></div>' }),
    "text/html",
  );
  document.body.replaceChildren(
    ...[...page.body.children].filter((el) => el.tagName !== "SCRIPT"),
  );
  await act(async () =>
    render(h(MainWindow, null), document.getElementById("root")!),
  );
  await settle();
};

afterEach(async () => {
  const root = document.getElementById("root");
  if (root) await act(async () => render(null, root));
  document.body.replaceChildren();
});

describe.each([
  ["desktop", 1440, true],
  ["compact", 768, true],
  ["phone", 360, false],
] as const)("the %s editor page's landmarks", (_name, pageWidth, docked) => {
  describe.each(["story", "assets", "share"] as const)("on %s", (route) => {
    it("has one banner, the title bar, outside the main landmark", async () => {
      await mountPage(pageWidth, route);
      const banners = landmarks("banner");
      expect(banners.map((el) => el.tagName.toLowerCase())).toEqual(["header"]);
      expect(banners[0]!.closest("main")).toBeNull();
    });

    it("has one main landmark, holding the route's content and none of the shell's bars or the preview", async () => {
      await mountPage(pageWidth, route);
      const mains = landmarks("main");
      expect(mains).toHaveLength(1);
      expect(mains[0]!.querySelector("[data-route]")).not.toBeNull();
      expect(mains[0]!.querySelector("[data-player]")).toBeNull();
      for (const role of ["banner", "navigation", "complementary"]) {
        expect(
          landmarks(role).filter((el) => mains[0]!.contains(el)),
          `${role} landmarks inside main`,
        ).toEqual([]);
      }
    });

    it("keeps its navigation landmarks and puts a docked preview in its own complementary landmark", async () => {
      await mountPage(pageWidth, route);
      expect(landmarks("navigation").length).toBeGreaterThan(0);
      const player = document.querySelector("[data-player]");
      if (docked) {
        expect(player).not.toBeNull();
        expect(landmarkOf(player!)).toEqual({
          role: "complementary",
          label: "Preview",
        });
      } else if (player) {
        expect(landmarkOf(player)?.role).not.toBe("main");
      }
    });
  });
});
