// I-1595: the builtin style named after a story target (`style title`, which
// sets `position = absolute` and centers its text) reaches the element the
// story writes that target to, and not an author's element that only shares
// the class. An author's `text.title "Inventory"` inside a column stays in the
// column's flow. A container carrying the target's name as a class in a layout
// that replaces `main` is the target's slot (#863, #1813) and keeps the style.
//
// jsdom has no cascade for nested rules, so these tests match the rendered
// elements against the selector the stylesheet states each style under; the
// rendered layout is checked in the browser.

import { describe, expect, test } from "vitest";
import {
  createDOMHarness,
  flushMicrotasks,
  type DOMHarness,
} from "./domTestHarness";

const TARGETS = [
  "backdrop",
  "portrait",
  "character_name",
  "character_parenthetical",
  "title",
  "heading",
  "transitional",
  "dialogue",
  "action",
];

/** A top-level rule's body, up to its closing brace at column 0. */
function ruleBody(css: string, selector: string): string | undefined {
  const start = css.indexOf(`spark-web-player #game ${selector} {\n`);
  if (start < 0) return undefined;
  const end = css.indexOf("\n}", start);
  return css.slice(css.indexOf("{", start) + 1, end);
}

/** The selector the style of class `name` states its declarations under:
 *  the rule's one nested block, which holds every declaration, so nothing
 *  applies to an element by the class alone. */
function styleSelector(css: string, name: string): string {
  const body = ruleBody(css, `.${name}`);
  expect(body, `no rule for .${name}`).toBeDefined();
  const lines = body!.split("\n").filter((l) => l.trim());
  const topLevel = lines.filter((l) => /^ {2}\S/.test(l));
  expect(topLevel[0], body).toMatch(/^ {2}&\S.* \{$/);
  expect(
    topLevel.slice(1).filter((l) => l.trim() !== "}"),
    `.${name} states something outside its scoped block:\n${body}`,
  ).toEqual([]);
  return `.${name}${topLevel[0]!.trim().slice(1, -2)}`;
}

function stylesheet(h: DOMHarness): string {
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

async function play(source: string): Promise<{ h: DOMHarness; css: string }> {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  h.jumpTo("start");
  let beat = h.nextBeat();
  while (beat) {
    await h.display(beat, true);
    await flushMicrotasks(10);
    beat = h.nextBeat();
  }
  return { h, css: stylesheet(h) };
}

describe("a builtin target's style", () => {
  test("reaches the builtin target and not an author's element with its class", async () => {
    const { h, css } = await play(`layout inventory with
  column.panel #child-gap=8 {
${TARGETS.map((t) => `    text.${t} "Inventory ${t}"`).join("\n")}
    row.title { text "Row" }
    text "Rope"
  }
end

-> start

scene start
  [[open inventory]]
  You rummage through your pack.
end
`);
    for (const target of TARGETS) {
      const selector = styleSelector(css, target);
      const builtin = [
        ...h.overlay.querySelectorAll<HTMLElement>(`.${target}`),
      ].filter((el) => el.className === target);
      expect(builtin, `builtin ${target}`).toHaveLength(1);
      expect(builtin[0]!.matches(selector), builtin[0]!.outerHTML).toBe(true);
      const authored = h.overlay.querySelector<HTMLElement>(
        `.panel > .text.${target}`,
      );
      expect(authored, h.overlay.innerHTML).not.toBeNull();
      expect(authored!.matches(selector), authored!.outerHTML).toBe(false);
    }
    // A container that only shares the class beside the builtin `title`.
    const row = h.overlay.querySelector<HTMLElement>(".panel > .row.title");
    expect(row, h.overlay.innerHTML).not.toBeNull();
    expect(row!.matches(styleSelector(css, "title"))).toBe(false);
  });

  test("reaches a container that is the target's slot in a layout that replaces `main`", async () => {
    const { h, css } = await play(`layout main with
  column.panel {
    row.title { text "Inventory" }
    text.heading "Rope"
  }
end

-> start

scene start
  ^: Chapter One
  You rummage through your pack.
end
`);
    const slot = h.overlay.querySelector<HTMLElement>(".panel > .row.title");
    expect(slot, h.overlay.innerHTML).not.toBeNull();
    expect(slot!.textContent).toContain("Chapter One");
    expect(slot!.matches(styleSelector(css, "title")), slot!.outerHTML).toBe(
      true,
    );
    const authored = h.overlay.querySelector<HTMLElement>(
      ".panel > .text.heading",
    );
    expect(authored, h.overlay.innerHTML).not.toBeNull();
    expect(authored!.matches(styleSelector(css, "heading"))).toBe(false);
  });

  test("reaches the story's choices and not an author's element with the choice class", async () => {
    const h = createDOMHarness(
      `layout inventory with
  column.panel {
    button.choice "Use"
    text "Rope"
  }
end

-> start

scene start
  [[open inventory]]
  Pick:
  choose
    + (a) Apple
      -> DONE
    + (b) Banana
      -> DONE
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.jumpTo("start");
    await h.display(h.nextBeat()!, true);
    await flushMicrotasks(10);
    const selector = styleSelector(stylesheet(h), "choice");
    const shown = [0, 1].map((i) =>
      [...h.overlay.querySelectorAll<HTMLElement>(".choice")].find(
        (el) => el.className === `choice ${i}`,
      ),
    );
    for (const choice of shown) {
      expect(choice, h.overlay.innerHTML).toBeDefined();
      expect(choice!.matches(selector), choice!.outerHTML).toBe(true);
    }
    const authored = h.overlay.querySelector<HTMLElement>(".panel > .choice");
    expect(authored, h.overlay.innerHTML).not.toBeNull();
    expect(authored!.textContent).toContain("Use");
    expect(authored!.matches(selector), authored!.outerHTML).toBe(false);
  });

  test("reaches a slot through the target it is the slot of, not another class it carries", async () => {
    const { h, css } = await play(`define HERO as character with
  name = "HERO"
end

layout main with
  column.panel {
    title { text }
    row.dialogue.title { text }
    row.dialogue.control { text }
    text "Rope"
  }
end

-> start

scene start
  HERO: Hello from the dialogue slot.
end
`);
    const title = styleSelector(css, "title");
    const dialogue = styleSelector(css, "dialogue");
    const named = [
      ...h.overlay.querySelectorAll<HTMLElement>(".panel > .title"),
    ].filter((el) => el.className === "title");
    expect(named, h.overlay.innerHTML).toHaveLength(1);
    expect(named[0]!.matches(title), named[0]!.outerHTML).toBe(true);
    const both = h.overlay.querySelector<HTMLElement>(
      ".panel > .row.dialogue.title",
    );
    const control = h.overlay.querySelector<HTMLElement>(
      ".panel > .row.dialogue.control",
    );
    expect(both, h.overlay.innerHTML).not.toBeNull();
    expect(control, h.overlay.innerHTML).not.toBeNull();
    expect(both!.textContent).toContain("Hello from the dialogue slot.");
    expect(both!.matches(dialogue), both!.outerHTML).toBe(true);
    expect(both!.matches(title), both!.outerHTML).toBe(false);
    expect(control!.matches(dialogue), control!.outerHTML).toBe(true);
  });

  test("leaves a slot while an element is named after the target, and returns to it after", async () => {
    const h = createDOMHarness(
      `store named = false

layout main with
  column.panel {
    row.title { text "Inventory" }
    if named then
      title { text "Named" }
    end
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks(10);
    const selector = styleSelector(stylesheet(h), "title");
    const slot = h.overlay.querySelector<HTMLElement>(".panel > .row.title");
    expect(slot, h.overlay.innerHTML).not.toBeNull();
    const named = () =>
      [...h.overlay.querySelectorAll<HTMLElement>(".title")].filter(
        (el) => el.className === "title",
      );
    const toggle = async (value: boolean) => {
      (h.game.story.variablesState as any).$("named", value);
      (h.game.module.ui as any).refreshLayouts();
      await flushMicrotasks(10);
    };
    expect(named()).toHaveLength(0);
    expect(slot!.matches(selector), slot!.outerHTML).toBe(true);
    await toggle(true);
    expect(named(), h.overlay.innerHTML).toHaveLength(1);
    expect(named()[0]!.matches(selector), named()[0]!.outerHTML).toBe(true);
    expect(slot!.matches(selector), slot!.outerHTML).toBe(false);
    await toggle(false);
    expect(named()).toHaveLength(0);
    expect(slot!.matches(selector), slot!.outerHTML).toBe(true);
  });
});
