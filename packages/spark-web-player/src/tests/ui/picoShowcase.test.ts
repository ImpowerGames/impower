// The Pico showcase (docs/sparkle/pico-showcase.sd) as a CI regression surface.
//
// The showcase is a real, pasteable example file — this drives that SAME file
// through the real engine -> real player `UIManager` so the builtin Pico styles
// (nav / card / group / badge / button variants / widgets) can't silently rot.
//
// It also gates the example on being DIAGNOSTIC-CLEAN, which is what catches
// authoring mistakes like `text link "Home"` (two tags on one line → "an element
// can only have one tag" warning). An example that warns is a broken example.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SHOWCASE_URI = "inmemory:///main.sd";

// Resolved by walking UP from the vitest cwd (which is the package root when run
// per-package, the repo root when run from the workspace) rather than from
// `import.meta.url` — vitest's transform doesn't guarantee a `file:` scheme.
const SHOWCASE_REL = join("docs", "sparkle", "pico-showcase.sd");

function findShowcase(): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, SHOWCASE_REL);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate ${SHOWCASE_REL} above ${process.cwd()}`);
    }
    dir = parent;
  }
}

const SHOWCASE = readFileSync(findShowcase(), "utf8");

/** Every diagnostic the showcase produces, at any severity. */
function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    experimentalDisplayCalls: true,
    files: [
      {
        uri: SHOWCASE_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: SHOWCASE_URI } });
  const messages: string[] = [];
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      const msg =
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d));
      messages.push(msg);
    }
  }
  return messages;
}

describe("pico showcase example", () => {
  test("compiles with no diagnostics at any severity", () => {
    expect(diagnose(SHOWCASE)).toEqual([]);
  });

  test("renders visibly, with its Pico builtins realized in the DOM", async () => {
    const h = createDOMHarness(SHOWCASE, 0, { autoOpenAll: true });
    await h.ready;
    h.preview(0);
    await flushMicrotasks(20);

    // The layouts LAYER must be revealed — a UI-only project has no narrative
    // beat to reveal it (see previewUiOnlyReveal.test.ts).
    expect(h.overlay.querySelector(".layouts")?.getAttribute("style")).toContain(
      "opacity: 1",
    );

    // Structural classes are realized (and NOT hidden as transient write
    // targets — a styled static text inside a container used to hide it).
    for (const cls of ["container", "group", "grid"]) {
      const el = h.overlay.querySelector(`.${cls}`);
      expect(el, `expected a .${cls} element`).toBeTruthy();
      expect(el!.getAttribute("style") ?? "").not.toContain("display: none");
    }

    // Every button variant rendered, with its class.
    for (const variant of ["secondary", "contrast", "outline"]) {
      expect(
        h.overlay.querySelector(`.button.${variant}`),
        `expected a .button.${variant}`,
      ).toBeTruthy();
    }

    // Semantic element tags realize as their real HTML tags.
    for (const tag of [
      // Real DOM tags, from readable builtin names (`list` -> <ul>,
      // `header_cell` -> <th>, `modal` -> <dialog>, …).
      //
      // No `strong`/`em`/`mark`/`sub`/`sup` here: inline styling is a CLASS on a
      // text element, or a rich-text tag within a line — not an element. Both
      // are asserted below.
      "a", "button", "label", "hr", "ul", "li", "blockquote", "cite",
      "table", "thead", "tbody", "tr", "th", "td",
      "article", "section", "header", "footer", "form", "fieldset", "legend",
      "details", "summary", "dialog", "progress",
    ]) {
      expect(h.overlay.querySelector(tag), `expected a <${tag}>`).toBeTruthy();
    }

    // Every input type the reference page exercises.
    for (const type of [
      "text", "email", "search", "date", "time", "color", "file", "range",
      "checkbox", "radio",
    ]) {
      expect(
        h.overlay.querySelector(`input[type=${type}]`),
        `expected an input[type=${type}]`,
      ).toBeTruthy();
    }
    expect(
      h.overlay.querySelector("input[type=checkbox][role=switch]"),
    ).toBeTruthy();

    const select = h.overlay.querySelector("select") as HTMLSelectElement;
    // Options are DIRECT children and the bound store value selects one.
    expect(select.options.length).toBe(3);
    expect(select.value).toBe("medium");

    // Table shape: a header row plus three body rows, correctly parented.
    expect(h.overlay.querySelectorAll("table > thead > tr > th").length).toBe(4);
    expect(h.overlay.querySelectorAll("table > tbody > tr").length).toBe(3);

    // Variant classes compose: the reference shows all six button variants,
    // including `outline` combined with `secondary` / `contrast`.
    expect(h.overlay.querySelectorAll(".button").length).toBeGreaterThanOrEqual(6);
    expect(h.overlay.querySelector(".button.outline.secondary")).toBeTruthy();
    expect(h.overlay.querySelector(".button.outline.contrast")).toBeTruthy();
    // And on links, where the same classes must tint text rather than fill.
    expect(h.overlay.querySelector("a.link.secondary")).toBeTruthy();
    expect(h.overlay.querySelector("a.link.contrast")).toBeTruthy();

    // Attribute props reached the DOM as attributes.
    expect(h.overlay.querySelector("a")?.getAttribute("href")).toBe("#");
    expect(
      (h.overlay.querySelector("details") as HTMLDetailsElement).hasAttribute(
        "open",
      ),
    ).toBe(true);
    const progress = h.overlay.querySelector("progress") as HTMLProgressElement;
    expect(progress.getAttribute("max")).toBe("100");

    // The generic `input` must ship the same chrome as `field` — otherwise every
    // typed input falls back to the browser's white default next to a dark
    // `field`, which is exactly how it looked before `style input` existed.
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).toContain(".input");

    // Inline styling as CLASSES on a whole text element.
    for (const cls of ["bold", "italic", "underline", "strikethrough",
                       "deleted", "inserted", "highlight", "key"]) {
      expect(
        h.overlay.querySelector(`.text.${cls}`),
        `expected a .text.${cls}`,
      ).toBeTruthy();
    }

    // Inline rich text: a single `text` element split into styled runs, which
    // is what a whole-element class cannot express.
    const richRuns = [...h.overlay.querySelectorAll(".text span")].filter(
      (s) =>
        s.querySelector("span") === null &&
        /font-weight: 700|font-style: italic|line-through/.test(
          s.getAttribute("style") ?? "",
        ),
    );
    expect(richRuns.length).toBeGreaterThanOrEqual(3);

    // Content bindings interpolated.
    const text = h.overlay.querySelector(".main")?.textContent ?? "";
    expect(text).toContain("Pico");
    expect(text).toContain("Volume (40)");
    expect(text).toContain("Lovelace");
  });

  // The `@click` buttons are WIRED: made clickable and registered in the event
  // registry the renderer's EventMessage dispatches through.
  //
  // KNOWN HARNESS GAP: the end-to-end click -> handler -> re-render is verified
  // in a real browser (clicking Increment updates "Clicks: N"), but does NOT
  // repaint under this jsdom harness — invoking the registered callback mutates
  // the store yet `refreshLayouts()` leaves the DOM text unchanged. That's a
  // harness-fidelity problem, not a product one, so this asserts the wiring
  // rather than pretending to cover the repaint.
  test("@click buttons are made clickable and registered as handlers", async () => {
    const h = createDOMHarness(SHOWCASE, 0, { autoOpenAll: true });
    await h.ready;
    h.preview(0);
    await flushMicrotasks(20);

    const byLabel = (label: string) =>
      [...h.overlay.querySelectorAll(".button")].find(
        (el) => (el.textContent ?? "").trim() === label,
      ) as HTMLElement | undefined;

    const registered = ((h.game as any).module.ui as any)._events?.["click"] ?? {};

    for (const label of ["Launch demo modal", "Cancel", "Confirm"]) {
      const el = byLabel(label);
      expect(el, `expected a "${label}" button`).toBeTruthy();
      expect(el!.style.pointerEvents).toBe("auto");
      expect(
        typeof registered[el!.id],
        `expected a click handler registered for "${label}"`,
      ).toBe("function");
    }

    // A button with no `@click` must NOT be wired.
    const plain = byLabel("Primary");
    expect(plain).toBeTruthy();
    expect(registered[plain!.id]).toBeUndefined();
  });
});
