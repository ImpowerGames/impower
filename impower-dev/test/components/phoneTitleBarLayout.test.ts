import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeAll, describe, expect, it } from "vitest";

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

const { default: PhoneTitleBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/PhoneTitleBar");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
const { default: problems } =
  await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");


const LONG_NAME =
  "The Extraordinarily Long Midnight Jukebox Story of Raffles X";

const markupOn = async (
  route: "story" | "assets",
  name = "The Midnight Jukebox",
) => {
  const state = stateForRoute(workspace.state.value as WorkspaceCache, route);
  workspace.state.value = {
    ...state,
    project: { ...state.project, name },
    sync: { ...state.sync, status: "cached" },
  } as WorkspaceCache;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PhoneTitleBar, { scrolled: false }), host));
  const field = host.querySelector<HTMLInputElement>(
    'input[aria-label="Project name"]',
  )!;
  field.setAttribute("value", field.value);
  const markup = host.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  return markup;
};

type BarState = "assets" | "story" | "editing" | "naming";

const markupIn = async (barState: BarState) => {
  const route = barState === "assets" ? "assets" : "story";
  workspace.state.value = stateForRoute(
    workspace.state.value as WorkspaceCache,
    route,
  );
  workspace.layout.value = "phone";
  workspace.scriptMode.value = barState === "editing" ? "editing" : "reading";
  const host = document.body.appendChild(document.createElement("div"));
  try {
    await act(async () => render(h(PhoneTitleBar, { scrolled: false }), host));
    if (barState === "naming") {
      await act(async () =>
        host
          .querySelector<HTMLInputElement>('input[aria-label="Project name"]')!
          .focus(),
      );
    }
    return host.innerHTML;
  } finally {
    await act(async () => render(null, host));
    host.remove();
    workspace.scriptMode.value = "reading";
  }
};

const measureEdges = async (markup: string, width: number) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>("[data-phone-title-bar]")!;
      const style = getComputedStyle(bar);
      const controls = [...bar.children].filter(
        (child) => getComputedStyle(child).position !== "absolute",
      );
      const last = controls.at(-1)!;
      const group = last.matches("button") ? null : last;
      const logo = bar.querySelector('[aria-label="Spark Engine"] svg');
      return {
        height: bar.getBoundingClientRect().height,
        inset: `${style.paddingLeft} ${style.paddingRight}`,
        gap: style.columnGap,
        groupGap: group ? getComputedStyle(group).columnGap : null,
        firstLeft: controls[0]!.getBoundingClientRect().x,
        lastRight: last.getBoundingClientRect().right,
        controlWidths: [...bar.querySelectorAll("button")]
          .slice(-2)
          .map((b) => b.getBoundingClientRect().width),
        search: (() => {
          const box = bar
            .querySelector('button[aria-label="Search"]')
            ?.getBoundingClientRect();
          return box ? box.x + box.width / 2 : null;
        })(),
        logoX: logo ? logo.getBoundingClientRect().x : null,
        labels: [...bar.querySelectorAll("button")].map((b) =>
          b.getAttribute("aria-label"),
        ),
      };
    });
  } finally {
    await browser.close();
  }
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', {
    base: UI_PACKAGE,
    onDependency: () => {},
  });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap(
    (match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const measure = async (markup: string, width: number) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    return await page.evaluate(() => {
      const bar = document.querySelector("[data-phone-title-bar]")!;
      const box = (selector: string) =>
        bar.querySelector(selector)!.getBoundingClientRect();
      const centre = (label: string) => {
        const r = box(`button[aria-label="${label}"]`);
        return r.x + r.width / 2;
      };
      const input = bar.querySelector<HTMLInputElement>(
        'input[aria-label="Project name"]',
      )!;
      const name = input.getBoundingClientRect();
      const nameStyle = getComputedStyle(input);
      const status = box(".fade-edge-over");
      const statusStyle = getComputedStyle(
        bar.querySelector('[role="status"] button')!,
      );
      const statusRow = box('[role="status"]');
      const logo = box('[aria-label="Spark Engine"] svg');
      const logoBox = bar
        .querySelector('[aria-label="Spark Engine"]')!
        .parentElement!.getBoundingClientRect();
      return {
        logo: { x: logo.x, width: logo.width, height: logo.height },
        logoBox: { width: logoBox.width, height: logoBox.height },
        name: {
          x: name.x,
          right: name.right,
          height: name.height,
          font: `${nameStyle.fontSize}/${nameStyle.lineHeight}`,
          mask: nameStyle.maskImage,
          overflows: input.scrollWidth > input.clientWidth,
        },
        statusX: status.x,
        status: {
          font: `${statusStyle.fontSize}/${statusStyle.lineHeight}`,
          height: statusRow.height,
        },
        searchLeft: box('button[aria-label="Search"]').x,
        search: centre("Search"),
        menu: centre("App menu"),
      };
    });
  } finally {
    await browser.close();
  }
};

const rounded = (value: number) => Math.round(value * 10) / 10;

describe(
  "the phone title bar against the Folio prototype",
  () => {
    it.each([
      [430, "assets", 347, 398],
      [360, "assets", 277, 328],
      [430, "story", 347, 398],
      [360, "story", 277, 328],
    ] as const)(
      "at %ipx on %s, sits on one 10px inset with 7px gaps",
      async (width, route, search, menu) => {
        const bar = await measure(await markupOn(route), width);
        expect(bar.logoBox).toEqual({ width: 44, height: 44 });
        expect(bar.logo).toEqual({ x: 20, width: 24, height: 30 });
        expect(bar.name.x).toBe(61);
        expect(rounded(bar.name.height)).toBe(15.6);
        expect(bar.name.font).toBe("12px/15.6px");
        expect(bar.statusX).toBe(61);
        expect(bar.status.font).toBe("11px/15.4px");
        expect(rounded(bar.status.height)).toBe(15.4);
        expect([bar.search, bar.menu]).toEqual([search, menu]);
      },
      60000,
    );

    it.each([
      [430, "assets", "App menu"],
      [360, "assets", "App menu"],
      [430, "story", "App menu"],
      [360, "story", "App menu"],
      [430, "editing", "Done editing"],
      [360, "editing", "Done editing"],
      [430, "naming", "Keep the name"],
      [360, "naming", "Keep the name"],
    ] as const)(
      "at %ipx while %s, the bar keeps its 90px height and the one 10px inset with 7px gaps",
      async (width, barState, lastLabel) => {
        const bar = await measureEdges(await markupIn(barState), width);
        expect(bar.labels.at(-1)).toBe(lastLabel);
        expect(bar.height).toBe(90);
        expect(bar.inset).toBe("10px 10px");
        expect(bar.gap).toBe("7px");
        expect(bar.firstLeft).toBe(10);
        expect(bar.lastRight).toBe(width - 10);
        if (barState !== "naming") {
          expect(bar.groupGap).toBe("7px");
        }
        if (barState !== "editing") {
          expect(bar.logoX).toBe(20);
        }
        if (barState !== "naming") {
          expect(bar.search).toBe(width - 83);
          expect(bar.controlWidths).toEqual([44, 44]);
        }
      },
      60000,
    );

    it.each([
      [430, "assets", 347, 398],
      [360, "assets", 277, 328],
      [430, "story", 347, 398],
      [360, "story", 277, 328],
    ] as const)(
      "at %ipx on %s, a 60-character name fades on one line and leaves the buttons where they were",
      async (width, route, search, menu) => {
        const bar = await measure(await markupOn(route, LONG_NAME), width);
        expect(bar.name.x).toBe(61);
        expect(rounded(bar.name.height)).toBe(15.6);
        expect(bar.name.overflows).toBe(true);
        expect(bar.name.mask).toBe(
          "linear-gradient(to right, rgb(0, 0, 0) calc(100% - 24px), rgba(0, 0, 0, 0))",
        );
        expect(bar.name.right).toBeLessThanOrEqual(bar.searchLeft);
        expect([bar.search, bar.menu]).toEqual([search, menu]);
      },
      60000,
    );
  },
);

const withProblems = async <T>(run: () => Promise<T>) => {
  const at = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
  await act(async () => {
    problems.diagnostics.value = {
      "file:///local/main.sd": [
        { range: at, severity: 1, message: "Cannot find character" },
        { range: at, severity: 2, message: "This sound is not in Assets yet" },
      ],
    } as typeof problems.diagnostics.value;
  });
  try {
    return await run();
  } finally {
    await act(async () => {
      problems.diagnostics.value = {};
    });
  }
};

const TARGETS = {
  name: 'input[aria-label="Project name"]',
  status: '[role="status"] button',
  problems: 'button[data-tone="error"]',
} as const;

const probeTargets = async (markup: string, width: number) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}<main style="height:600px"><button style="width:100%;height:100%">Content</button></main></body></html>`,
    );
    const hit = await page.evaluate((targets) => {
      const selector =
        'button, a[href], input:not([type="hidden"]), [role="button"], [tabindex]:not([tabindex="-1"])';
      const reachOf = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const label = el.closest("label");
        const hits = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
          const at = document.elementFromPoint(x, y);
          if (!at) return false;
          if (at === el || el.contains(at)) return true;
          if (!label || !(at === label || label.contains(at))) return false;
          const control = at.closest(selector);
          return !control || control === el || !label.contains(control);
        };
        const reach = (dx: number, dy: number) => {
          let n = 0;
          while (n < 44 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
          return n;
        };
        return {
          width: Math.min(reach(-1, 0) + reach(1, 0) + 1, 44),
          height: Math.min(reach(0, -1) + reach(0, 1) + 1, 44),
        };
      };
      return Object.fromEntries(
        Object.entries(targets).map(([key, query]) => [
          key,
          reachOf(document.querySelector(query)!),
        ]),
      );
    }, TARGETS);
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send("DOM.getDocument");
    const named = async (query: string) => {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: query,
      });
      const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
        nodeId,
        fetchRelatives: false,
      });
      const node = nodes[0]!;
      const text = await page.locator(query).evaluate((el) => ({
        text: el.textContent!.trim(),
        title: el.getAttribute("title"),
      }));
      return {
        name: node.name?.value,
        description: node.description?.value,
        ...text,
      };
    };
    return {
      hit,
      status: await named(TARGETS.status),
      problems: await named(TARGETS.problems),
    };
  } finally {
    await browser.close();
  }
};

describe("the phone title bar's text controls", () => {
  it.each([
    [430, "assets"],
    [360, "assets"],
    [430, "story"],
    [360, "story"],
  ] as const)(
    "at %ipx on %s, the name, the save status and the problem count each take a tap anywhere in a 44px band",
    async (width, route) => {
      const bar = await withProblems(async () =>
        probeTargets(await markupOn(route), width),
      );
      expect(bar.hit).toEqual({
        name: { width: 44, height: 44 },
        status: { width: 44, height: 44 },
        problems: { width: 44, height: 44 },
      });
    },
    60000,
  );

  it("names the save status and the problem count by the words they show, with each title as the description", async () => {
    const bar = await withProblems(async () =>
      probeTargets(await markupOn("story"), 360),
    );
    expect(bar.status.text).not.toBe("");
    expect(bar.status).toEqual({
      name: bar.status.text,
      description: bar.status.title,
      text: bar.status.text,
      title: bar.status.title,
    });
    expect(bar.problems).toEqual({
      name: "2 problems",
      description: "Show problems",
      text: "2 problems",
      title: "Show problems",
    });
  }, 60000);
});
