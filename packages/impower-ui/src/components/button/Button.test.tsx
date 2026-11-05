import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, type ComponentChild, type Ref } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { hitArea } from "../../../test/hitArea";
import Button, { buttonVariants, type ButtonSize, type ButtonVariant } from "./Button";

const VARIANTS = ["default", "primary", "quiet", "destructive"] as const satisfies readonly ButtonVariant[];
const SIZES = ["default", "icon", "pill"] as const satisfies readonly ButtonSize[];

const mount = async (node: ComponentChild): Promise<HTMLDivElement> => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(node, host);
  });
  return host;
};

const packageCss = async (classes: string[]): Promise<string> => {
  const source = readFileSync(resolve("src/style.css"), "utf8");
  const compiler = await compile(source, { base: resolve("src"), onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("Button kinds", () => {
  it.each(VARIANTS.flatMap((variant) => SIZES.map((size) => [variant, size] as const)))(
    "a %s %s button keeps a 44px hit area",
    async (variant, size) => {
      const host = await mount(
        <Button variant={variant} size={size}>
          A
        </Button>,
      );
      const area = await hitArea(host.querySelector("button")!);
      expect(area.width).toBeGreaterThanOrEqual(44);
      expect(area.height).toBeGreaterThanOrEqual(44);
    },
  );

  it("draws every kind with the one control radius except the phone pill", () => {
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant, size: "default" })).toContain("rounded-control");
      expect(buttonVariants({ variant, size: "icon" })).toContain("rounded-control");
    }
  });

  it("lets the page's class replace the variant's conflicting radius", async () => {
    const host = await mount(<Button size="pill">Done</Button>);
    const classes = host.querySelector("button")!.className.split(/\s+/);
    expect(classes).toContain("rounded-[16px]");
    expect(classes).not.toContain("rounded-control");
  });
});

describe("Button hover, press and focus", () => {
  it("draws hover only under a hovering pointer, and press as a second overlay layer", async () => {
    const css = await packageCss(["control-overlay"]);
    const enabled = String.raw`:not\(:disabled, \[data-disabled\], \[aria-disabled="true"\]\)`;
    expect(css).toMatch(new RegExp(String.raw`@media \(hover: hover\) \{\s*\.control-overlay:hover${enabled}:?:before`));
    expect(css).toMatch(new RegExp(String.raw`\.control-overlay:active${enabled}:?:after`));
    expect(css).toMatch(/background-color: var\(--control-hover\)/);
    expect(css).toMatch(/pointer-events: none/);
  });

  it("gates the overlay's fade on prefers-reduced-motion", async () => {
    const css = await packageCss(["control-overlay"]);
    const gated = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(gated).toMatch(/\.control-overlay:?:before, \.control-overlay:?:after \{\s*transition: opacity \.14s/);
    const overlay = css.slice(css.indexOf(".control-overlay"), css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(overlay).not.toMatch(/transition/);
  });

  it("draws focus on the control's own edge in the accent, and Highlight under forced colours", async () => {
    const css = await packageCss([]);
    expect(css).toMatch(/\s:focus-visible \{\s*outline: 1px solid var\(--accent\);\s*outline-offset: -1px;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*:focus-visible \{\s*outline-color: highlight/i);
  });

  it("keeps every scrollbar thin over no track, with no later rule resetting it", async () => {
    const css = await packageCss([]);
    expect(css).toMatch(/\* \{\s*scrollbar-width: thin;\s*scrollbar-color: var\(--scrollbar\) var\(--scrollbar-track\);/);
    expect(css).not.toMatch(/scrollbar-(width|color): initial/);
    expect(css).toMatch(/:where\(\.overflow-auto, \.overflow-y-auto, \.overflow-scroll, \.overflow-y-scroll\) \{\s*scrollbar-gutter: stable/);
  });

  it("draws a field wrapper's edge while its input has keyboard focus, in Highlight under forced colours", async () => {
    const css = await packageCss(["focus-within-edge"]);
    expect(css).toMatch(/\.focus-within-edge:has\(:focus-visible\) \{\s*outline: 1px solid var\(--accent\);\s*outline-offset: -1px;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.focus-within-edge:has\(:focus-visible\) \{\s*outline-color: highlight/i);
  });

  it("draws a filled button's focus inside, in its ink", () => {
    expect(buttonVariants({ variant: "primary" })).toContain("focus-inset");
    expect(buttonVariants({ size: "pill" })).toContain("focus-inset");
  });

  it("dims a disabled button to 40% and gates its colour transition", () => {
    const classes = buttonVariants();
    expect(classes).toContain("disabled:opacity-40");
    expect(classes).toMatch(/(^|\s)motion-safe:transition-/);
    expect(classes).not.toMatch(/(^|\s)transition-/);
  });
});

describe("Button asChild", () => {
  it("slots its props onto the single child element", async () => {
    const host = await mount(
      <Button asChild>
        <a href="#open">Open</a>
      </Button>,
    );
    const anchor = host.querySelector("a");
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(anchor);
    expect(anchor?.textContent).toBe("Open");
    expect(anchor?.getAttribute("href")).toBe("#open");
    expect(anchor?.className).toContain("inline-flex");
    expect(host.querySelector("button")).toBeNull();
  });

  it("forwards its ref to the slotted child", async () => {
    const ref: { current: HTMLElement | null } = { current: null };
    const host = await mount(
      <Button asChild ref={ref as Ref<HTMLButtonElement>}>
        <a href="#open">Open</a>
      </Button>,
    );
    expect(ref.current).toBe(host.querySelector("a"));
  });

  it("renders a type=button holding only its children without asChild", async () => {
    const host = await mount(<Button>Go</Button>);
    const button = host.querySelector("button");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.textContent).toBe("Go");
    expect(button?.childNodes.length).toBe(1);
  });
});
