import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

function ruleBody(css: string, selector: string): string | undefined {
  const start = css.indexOf(`spark-web-player #game ${selector} {\n`);
  if (start < 0) return undefined;
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

const LOCKED_BESIDE_AUTHOR = `layout main with
  column {
    checkbox "Locked" #interactable=false #tooltip="Help"
    checkbox "Open" #tooltip="Help"
    label #interactable=false {
      box.control "Author box under a label" #tooltip="Help"
    }
    box.control "Author box" #tooltip="Help"
  }
end
`;

async function render(source: string) {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  await flushMicrotasks(20);
  const css = [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
  return { h, css };
}

describe("labelled input widgets in the page", () => {
  test("a widget's name finds it labelled or bare alike", async () => {
    const { h } = await render(`layout settings with
  column {
    slider "Named volume" #value=50
    slider #value=50
  }
end
`);
    const label = h.overlay.querySelector<HTMLElement>("label");
    expect(label, h.overlay.innerHTML).not.toBeNull();
    expect(label!.className).toBe("slider");
    const bare = [...h.overlay.querySelectorAll<HTMLElement>("input")].find(
      (el) => el.parentElement !== label,
    );
    expect((h.ui as any).findTargetElements("slider")).toEqual([label, bare]);
  });

  test("the tooltip opt-in leaves out exactly the labelled widgets' controls", async () => {
    const { h, css } = await render(LOCKED_BESIDE_AUTHOR);
    const layouts = ruleBody(css, ".layouts");
    expect(layouts).toBeDefined();
    const tooltip = layouts!.slice(layouts!.indexOf("& [data-tooltip] {"));
    const exception = tooltip.match(
      /&:where\(:not\(([^()]+)\)\) \{\s*pointer-events: auto;/,
    );
    expect(exception, tooltip.slice(0, 400)).not.toBeNull();
    const head = tooltip.slice(0, tooltip.indexOf(exception![0]));
    expect(head).not.toMatch(/pointer-events: auto;/);

    const left = exception![1]!;
    const tipped = [...h.overlay.querySelectorAll<HTMLElement>("[data-tooltip]")];
    const controls = tipped.filter((el) => el.tagName === "INPUT");
    const boxes = tipped.filter((el) => el.tagName !== "INPUT");
    expect(controls, h.overlay.innerHTML).toHaveLength(2);
    expect(boxes, h.overlay.innerHTML).toHaveLength(2);
    for (const control of controls) {
      expect(control.matches(left), control.outerHTML).toBe(true);
    }
    const underLabel = boxes.find((el) => el.parentElement?.tagName === "LABEL");
    expect(underLabel, h.overlay.innerHTML).toBeDefined();
    for (const box of boxes) {
      expect(box.matches(left), box.outerHTML).toBe(false);
    }
  });

  test("each control style hands its label's pointer to the labelled control alone", async () => {
    const { h, css } = await render(LOCKED_BESIDE_AUTHOR);
    const [locked] = [...h.overlay.querySelectorAll<HTMLElement>("input")];
    const authorBox = [...h.overlay.querySelectorAll<HTMLElement>(".box.control")].find(
      (el) => el.parentElement?.tagName === "LABEL",
    );
    expect(locked, h.overlay.innerHTML).toBeDefined();
    expect(authorBox, h.overlay.innerHTML).toBeDefined();
    for (const name of ["checkbox", "radio", "switch", "input", "slider"]) {
      const body = ruleBody(css, `.${name}`);
      expect(body, name).toBeDefined();
      const own = body!.indexOf("&:where(:not(label)), >:where(.control) {");
      const inherit = body!.match(
        /\n  >:where\(([^\n]+)\) \{\n    pointer-events: inherit;/,
      );
      expect(own, name).toBeGreaterThan(0);
      expect(inherit, name).not.toBeNull();
      expect(inherit!.index!, name).toBeGreaterThan(own);
      expect(locked!.matches(inherit![1]!), name).toBe(true);
      expect(authorBox!.matches(inherit![1]!), name).toBe(false);
    }
  });
});
