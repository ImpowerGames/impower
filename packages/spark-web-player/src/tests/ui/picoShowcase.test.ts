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
    for (const cls of ["container", "nav", "card", "group", "badge"]) {
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

    // Builtin element tags realize as their real DOM controls.
    // NOTE: `link` currently renders as a `div.link`, NOT an `<a>` — the whole
    // tree is divs apart from the form controls below. Asserted as-is so the
    // gap is visible rather than assumed; see the a11y follow-up.
    expect(h.overlay.querySelectorAll(".link").length).toBe(3);
    expect(h.overlay.querySelector("input[type=range]")).toBeTruthy();
    expect(h.overlay.querySelector("input[type=checkbox]")).toBeTruthy();
    // Phase 2 widgets.
    expect(h.overlay.querySelector("input[type=radio]")).toBeTruthy();
    expect(
      h.overlay.querySelector("input[type=checkbox][role=switch]"),
    ).toBeTruthy();
    expect(h.overlay.querySelector("input[type=email]")).toBeTruthy();
    const textarea = h.overlay.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    expect(textarea!.value).toBe("Dear diary");
    const select = h.overlay.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    // Options are DIRECT children and the bound store value selects one.
    expect(select.options.length).toBe(2);
    expect(select.value).toBe("pro");

    // Content bindings interpolated.
    const text = h.overlay.querySelector(".main")?.textContent ?? "";
    expect(text).toContain("Sparkle x Pico");
    expect(text).toContain("Clicks: 0");
    expect(text).toContain("Volume (40)");
    expect(text).toContain("Notifications: true");
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

    for (const label of ["Increment", "Reset"]) {
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
