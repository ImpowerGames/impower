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
      // The line is MEANING, not appearance: anything a screen reader acts on
      // is an element, anything purely visual (`mark`, `highlight`, `muted`)
      // stays a class. `kbd`/`sub`/`sup` moved across that line — they were
      // listed here as counter-examples until it was clear they carry meaning
      // too, and that a <div class="h2"> is not a heading to anyone but a
      // sighted reader.
      "a", "button", "label", "ul", "li", "blockquote", "cite",
      // Semantic inline elements (importance / stress emphasis).
      "strong", "em",
      // Headings, the primary way assistive tech navigates a page at all.
      "h1", "h2", "h3", "h4", "h5", "h6",
      // `sub`/`sup` come from RICH TEXT (`"x<sub>1</sub>"`), not element lines,
      // so this also pins that the parser mounts them as real elements.
      // No `code`: the reference page has none either, so the showcase has
      // nothing to mirror. The builtin exists and is exercised by the style
      // tests; asserting it here would only pin a gap in the fixture.
      "small", "kbd", "sub", "sup",
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
    // Options are DIRECT children and the bound store value selects one. The
    // first is Pico's placeholder: empty-valued and selected, which combined
    // with `required` makes it unsubmittable rather than a real choice.
    expect(select.options.length).toBe(2);
    expect(select.options[0]?.textContent).toBe("Select…");
    expect(select.options[0]?.value).toBe("");
    expect(select.required).toBe(true);
    expect(select.value).toBe("");

    // Table shape: 8 columns, three body rows, correctly parented.
    expect(h.overlay.querySelectorAll("table > thead > tr > th").length).toBe(8);
    expect(h.overlay.querySelectorAll("table > tbody > tr").length).toBe(3);
    // The row number is a `th[scope=row]` — it LABELS its row rather than
    // being another value in it.
    expect(
      h.overlay.querySelectorAll('table > tbody > tr > th[scope="row"]').length,
    ).toBe(3);
    expect(h.overlay.querySelectorAll("table > tbody > tr > td").length).toBe(
      21,
    );

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
    // Targeted rather than "the first details": the nav menu is also a
    // `details`, and it is deliberately CLOSED, so positional lookup would
    // assert the wrong element.
    expect(h.overlay.querySelector("details[open]")).toBeTruthy();
    const navMenu = h.overlay.querySelector(
      "details.menu",
    ) as HTMLDetailsElement;
    expect(navMenu, "expected the nav dropdown to be a details.menu").toBeTruthy();
    expect(navMenu.hasAttribute("open")).toBe(false);
    expect(navMenu.querySelector("summary")?.textContent).toBe("Theme");
    const progress = h.overlay.querySelector("progress") as HTMLProgressElement;
    expect(progress.getAttribute("max")).toBe("100");

    // Accessibility attributes the reference carries. A placeholder is not an
    // accessible name, so the Preview fields need an explicit `aria-label`.
    const firstName = h.overlay.querySelector(
      'input[aria-label="First name"]',
    ) as HTMLInputElement;
    expect(firstName, "expected an aria-labelled first-name input").toBeTruthy();
    expect(firstName.required).toBe(true);
    expect(
      (h.overlay.querySelector('input[aria-label="Email address"]') as
        | HTMLInputElement
        | null)?.required,
    ).toBe(true);

    // Pico expresses validation state through `aria-invalid`, not a class, so
    // the state is announced rather than only coloured.
    expect(h.overlay.querySelector('input[aria-invalid="false"]')).toBeTruthy();
    expect(h.overlay.querySelector('input[aria-invalid="true"]')).toBeTruthy();
    expect(
      (h.overlay.querySelector("input[disabled]") as HTMLInputElement | null)
        ?.disabled,
    ).toBe(true);

    // `<small>` helper text under a field, and after the article. The TAG, not
    // `.text.small`: `small` is a real element now, so the old selector matched
    // nothing — and matched nothing SILENTLY, since a count assertion on a
    // renamed element reads exactly like the element being absent.
    expect(h.overlay.querySelectorAll("small").length).toBeGreaterThanOrEqual(3);

    // A figure is a real <figure>/<img>/<figcaption>. The authored tag is
    // `picture`, because `image` is the engine's own backdrop-layer name.
    const figure = h.overlay.querySelector("figure") as HTMLElement;
    expect(figure, "expected a <figure>").toBeTruthy();
    const img = figure.querySelector("img") as HTMLImageElement;
    expect(img, "expected the picture to mount an <img>").toBeTruthy();
    expect(img.getAttribute("alt")).toBe("Minimal landscape");
    expect(figure.querySelector("figcaption")).toBeTruthy();

    // The generic `input` must ship the same chrome as `field` — otherwise every
    // typed input falls back to the browser's white default next to a dark
    // `field`, which is exactly how it looked before `style input` existed.
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).toContain(".input");

    // Purely visual styling as CLASSES on a whole text element. (`bold` /
    // `italic` exist too, but the reference marks those spots up semantically,
    // so the showcase uses the `strong` / `emphasis` ELEMENTS there.)
    // No `key` here any more: it became the `kbd` ELEMENT (asserted as a tag
    // above), so the showcase writes `kbd "Kbd"` and there is no `.text.key`.
    //
    // The HOST element is deliberately not pinned. These cells sit on
    // `paragraph` now rather than `text`, and that is the point of a visual
    // class: it rides on whatever element carries the content. Asserting
    // `.text.underline` only tested which builtin the showcase happened to use.
    for (const cls of ["underline", "strikethrough",
                       "deleted", "inserted", "highlight"]) {
      expect(
        h.overlay.querySelector(`.${cls}`),
        `expected an element with class ${cls}`,
      ).toBeTruthy();
    }


    // Content reached the DOM.
    const text = h.overlay.querySelector(".main")?.textContent ?? "";
    expect(text).toContain("Pico");
    // The reference table is deliberately generic placeholder content
    // ("Heading" / "Cell"); real names would change every column width.
    expect(text).toContain("Heading");
    expect(text).toContain("Cell");

    // Store bindings resolved. This is asserted on PROP bindings rather than an
    // interpolated label: the reference has no interpolated text, and the
    // showcase's job is to match it, so a `Volume ({volume})` label invented
    // purely to exercise interpolation does not belong here.
    expect(
      (h.overlay.querySelector('input[type="range"]') as HTMLInputElement).value,
    ).toBe("50");
    expect(
      (h.overlay.querySelector("progress") as HTMLProgressElement).getAttribute(
        "value",
      ),
    ).toBe("25");
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
