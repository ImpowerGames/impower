import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { anchorSelfTargeted, getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { ColorSchemeHost } from "../../app/ColorSchemeHost";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

type Scheme = "light" | "dark";

const config = (colorScheme: string, layouts = `{ "textstream" }`) =>
  `define ui as config with\n  layouts_initial = ${layouts}\n  color_scheme = "${colorScheme}"\nend\n`;

const STORY = `
scene start
  The train rattles on.
  The lights flicker.
  [[clear textstream]] A fresh page.
  The doors open.
end
`;

const ROLES = {
  paper: { property: "background-color", light: "neutral_99", dark: "neutral_10" },
  ink: { property: "color", light: "slate_20", dark: "slate_90" },
  accent: { property: "color", light: "orange_30", dark: "orange_80" },
  muted: { property: "color", light: "slate_60", dark: "slate_70" },
} as const;

const DARK_RULE = ':where([data-color-scheme="dark"]) &';

async function showBeats(h: DOMHarness, count: number) {
  h.jumpTo("start");
  for (let i = 0; i < count; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeDefined();
    new Coordinator(h.game, beat!).onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(30);
  }
}

const stylesheet = (h: DOMHarness) =>
  [...h.overlay.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");

const block = (css: string, opener: string): string | undefined => {
  const start = css.indexOf(opener);
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start + opener.length - 1; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}" && --depth === 0) return css.slice(start + opener.length, i);
  }
  return undefined;
};

const declaration = (body: string | undefined, property: string): string | undefined => {
  if (body === undefined) return undefined;
  let depth = 0;
  let own = "";
  for (const c of body) {
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (depth === 0) own += c;
  }
  const m = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(own);
  return m?.[1]?.trim();
};

const resolveRole = (css: string, style: string, property: string, scheme: string | null) => {
  const body = block(css, `#game .${style} {`);
  const variant = scheme === "dark" ? declaration(block(body ?? "", `${DARK_RULE} {`), property) : undefined;
  return variant ?? declaration(body, property);
};

const paletteName = (value: string | undefined) => /--theme-color-([a-z]+_\d+)/.exec(value ?? "")?.[1];

afterEach(() => {
  vi.unstubAllGlobals();
});

const fakeDevice = (dark: boolean) => {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", (query: string) => {
    expect(query).toBe("(prefers-color-scheme: dark)");
    return media;
  });
  return {
    listeners,
    change(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
};

const mount = async (source: string, beats = 2, before?: (h: DOMHarness) => void) => {
  const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
  before?.(h);
  await h.ready;
  await showBeats(h, beats);
  return h;
};

const attribute = (h: DOMHarness) => h.overlay.getAttribute("data-color-scheme");

describe("@theme(...) becomes a condition on the game's root (#2062)", () => {
  test("the variant reads the root's data-color-scheme and keeps its style's specificity", () => {
    expect(getCSSSelector("@theme(dark)", {})).toBe(DARK_RULE);
    expect(getCSSSelector("@theme(light)", {})).toBe(':where([data-color-scheme="light"]) &');
    expect(anchorSelfTargeted(DARK_RULE)).toBe(DARK_RULE);
  });

  test("it combines with a state variant written on either side, keeping the state on the styled element", () => {
    expect(anchorSelfTargeted(getCSSSelector("@theme(dark) @hovered", {}))).toBe(`${DARK_RULE}:hover`);
    expect(anchorSelfTargeted(getCSSSelector("@hovered @theme(dark)", {}))).toBe(`${DARK_RULE}:hover`);
    expect(anchorSelfTargeted(getCSSSelector("@focused @theme(light)", {}))).toBe(':where([data-color-scheme="light"]) &:focus');
  });

  test("whitespace inside the parentheses is accepted", () => {
    expect(getCSSSelector("@theme( dark )", {})).toBe(DARK_RULE);
    expect(getCSSSelector("@theme(\tdark\t)", {})).toBe(DARK_RULE);
  });

  test.each(["@screen-size", "@screen_size", "@container-size", "@container_size"])(
    "%s takes inner spaces and tabs around its breakpoint, as @theme does",
    (variant) => {
      const breakpoints = { md: 768 };
      const written = getCSSSelector(`${variant}(md)`, breakpoints);
      expect(written).toContain("768px");
      expect(getCSSSelector(`${variant}( md )`, breakpoints)).toBe(written);
      expect(getCSSSelector(`${variant}(\tmd\t)`, breakpoints)).toBe(written);
    },
  );

  test("a descendant selector under the variant stays below the styled element", () => {
    expect(anchorSelfTargeted(getCSSSelector("@theme(dark) >> child", {}))).toBe(`${DARK_RULE} .child`);
  });

  test("an ampersand inside a quoted attribute value does not stop self anchoring", () => {
    expect(anchorSelfTargeted('[title="A&B"]')).toBe('&[title="A&B"]');
    expect(anchorSelfTargeted("[title='A&B'], :hover")).toBe("&[title='A&B'], &:hover");
  });
});

describe("the four page roles resolve from the setting and the scheme (#2062)", () => {
  for (const setting of ["system", "light", "dark"]) {
    for (const scheme of ["light", "dark"] as Scheme[]) {
      const expected: Scheme = setting === "system" ? scheme : (setting as Scheme);
      test(`ui.color_scheme ${setting} with a ${scheme} scheme draws the page ${expected}`, async () => {
        const h = await mount(`${config(setting)}${STORY}`, 2, (h) => ColorSchemeHost.for(h.overlay).simulate(scheme));
        expect(attribute(h)).toBe(expected);
        const css = stylesheet(h);
        for (const [role, values] of Object.entries(ROLES)) {
          expect(paletteName(resolveRole(css, role, values.property, attribute(h))), role).toBe(values[expected]);
        }
      });
    }
  }

  test("with no simulated scheme, system follows the device, and a device change restyles the page without remounting it", async () => {
    const device = fakeDevice(false);
    const h = await mount(`${config("system")}${STORY}`, 4);
    expect(attribute(h)).toBe("light");
    expect(device.listeners.size).toBe(1);
    const page = h.overlay.querySelector(".textstream_column")!;
    expect(page.children.length).toBeGreaterThan(0);
    const nodes = [...h.overlay.querySelectorAll("*")];
    const entries = [...page.children].map((el) => el.textContent);
    const cssBefore = stylesheet(h);
    device.change(true);
    await flushMicrotasks(10);
    expect(attribute(h)).toBe("dark");
    const after = [...h.overlay.querySelectorAll("*")];
    expect(after.length).toBe(nodes.length);
    expect(after.filter((node, i) => node !== nodes[i]).length).toBe(0);
    expect(nodes.every((node) => node.isConnected)).toBe(true);
    const current = h.overlay.querySelector(".textstream_column")!;
    expect(current === page).toBe(true);
    expect([...current.children].map((el) => el.textContent)).toEqual(entries);
    expect(stylesheet(h)).toBe(cssBefore);
    expect(paletteName(resolveRole(cssBefore, "ink", "color", attribute(h)))).toBe("slate_90");
  });

  test("a simulated scheme from the preview wins over the device, and holds for the next run", async () => {
    fakeDevice(false);
    const first = await mount(`${config("system")}${STORY}`, 1, (h) => {
      ColorSchemeHost.for(h.overlay).simulate("dark");
    });
    expect(attribute(first)).toBe("dark");
    await first.rerender(`${config("system")}${STORY}`);
    expect(attribute(first)).toBe("dark");
  });

  test("a game that pins its scheme ignores a device change", async () => {
    const device = fakeDevice(true);
    const h = await mount(`${config("light")}${STORY}`, 1);
    expect(attribute(h)).toBe("light");
    device.change(false);
    device.change(true);
    expect(attribute(h)).toBe("light");
  });
});

describe("only the page roles change between schemes (#2062)", () => {
  test("the Visual Novel textbox's styles hold no scheme variant, so they resolve the same in both", async () => {
    const h = await mount(`${config("system", `{ "textbox" }`)}${STORY}`, 1);
    const css = stylesheet(h);
    const textbox = h.overlay.querySelector(".textbox");
    expect(textbox, h.overlay.innerHTML).not.toBeNull();
    const classes = new Set([textbox!, ...textbox!.querySelectorAll("*")].flatMap((el) => [...el.classList]));
    for (const name of classes) {
      if (name in ROLES) continue;
      expect(block(css, `#game .${name} {`) ?? "", name).not.toContain("data-color-scheme");
    }
    const variants = [...css.matchAll(/#game \.([a-z_]+) \{/g)]
      .map((m) => m[1]!)
      .filter((name) => (block(css, `#game .${name} {`) ?? "").includes("data-color-scheme"));
    expect([...new Set(variants)].sort()).toEqual(Object.keys(ROLES).sort());
  });

  test("the engine's stream to the player, apart from random request ids, is the same whichever scheme the preview simulates", async () => {
    const stream = async (scheme: Scheme) => {
      const received: unknown[] = [];
      const h = createDOMHarness(`${config("system", `{ "textbox" }`)}${STORY}`, 0, {
        reactive: true,
        autoOpenAll: false,
        afterEachMessage: (message) => received.push(message),
      });
      ColorSchemeHost.for(h.overlay).simulate(scheme);
      await h.ready;
      await showBeats(h, 2);
      expect(attribute(h)).toBe(scheme);
      return JSON.stringify(received, (key, value) => (key === "id" ? undefined : value));
    };
    expect(await stream("dark")).toBe(await stream("light"));
  });

  test.each(["color", "text-color", "text_color"])(
    "an author's ink with its own dark variant, written with %s, puts the variant after its base colour",
    async (spelling) => {
      const h = await mount(
        `${config("system")}${STORY}\nstyle ink {\n  ${spelling} = red_50\n  @theme(dark) {\n    ${spelling} = red_90\n  }\n}\n`,
        1,
      );
      const body = block(stylesheet(h), "#game .ink {") ?? "";
      const variantAt = body.indexOf(DARK_RULE);
      expect(variantAt).toBeGreaterThan(-1);
      expect(body.lastIndexOf("--theme-color-red_50")).toBeLessThan(variantAt);
      expect(body.slice(variantAt)).toContain("--theme-color-red_90");
      expect(body.slice(variantAt)).not.toContain("--theme-color-slate_90");
    },
  );

  test("an author's own ink applies in both schemes", async () => {
    const h = await mount(`${config("system")}${STORY}\nstyle ink {\n  text-color = red_50\n}\n`, 1);
    const css = stylesheet(h);
    expect(paletteName(resolveRole(css, "ink", "color", "light"))).toBe("red_50");
    expect(paletteName(resolveRole(css, "ink", "color", "dark"))).toBe("red_50");
    expect(paletteName(resolveRole(css, "accent", "color", "dark"))).toBe("orange_80");
  });
});
