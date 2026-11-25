import { describe, expect, test } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { anchorSelfTargeted, getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import { writeSparkleSelectorChecked } from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

const written = (selector: string) => anchorSelfTargeted(getCSSSelector(selector, {}));

describe("@variant(name) and @speaker(name) compile to marks on the game's root (#2741)", () => {
  test("each tests its own attribute on the root", () => {
    expect(written("@variant(shout)")).toBe(':where([data-line-variant="shout"]) &');
    expect(written("@speaker(bunny)")).toBe(':where([data-line-speaker="bunny"]) &');
    expect(written("@speaker(bunny@night)")).toBe(':where([data-line-speaker="bunny@night"]) &');
    expect(written("@variant(left) @hovered")).toBe(':where([data-line-variant="left"]) &:hover');
    expect(written("@showing(simultaneous) @variant(left)")).toBe(
      ':where([data-showing~="simultaneous"][data-line-variant="left"]) &',
    );
  });

  test("#variant=left selects the elements written with the prop", () => {
    expect(written("#variant=left")).toBe('&[data-variant=left]');
    expect(written("#speaker=bunny")).toBe('&[data-speaker=bunny]');
  });

  test("a position that refuses @showing refuses @variant and @speaker too", () => {
    for (const selector of ["icon > @variant(shout)", "@not(@speaker(bunny))", "@media (frame @variant(left))"]) {
      const { refusals } = writeSparkleSelectorChecked(selector, { breakpoints: {}, colorScheme: "attribute" });
      expect(refusals).toHaveLength(1);
    }
  });

  test("a written argument that is not one word is left as written, so it never applies", () => {
    expect(written("@variant(a b)")).toBe("@variant(a b)");
    expect(written("@speaker(a-b)")).toBe("@speaker(a-b)");
  });
});

const SOURCE = `define bunny as character with
  name = "BUNNY"
end

define ui as config with
  layouts_initial = { "textbox", "hud" }
end

layout hud {
  frame {
    text = HUD
  }
}

style frame {
  @variant(shout) {
    background-color = neutral_95
  }
  @speaker(bunny) {
    opacity = 0.5
  }
}

scene start
  BUNNY [shout]:
    I'm busy!
  BUNNY:
    Fine.
  The door opens.
end
`;

const compiledRule = (h: DOMHarness, mark: string) => {
  const lines = [...h.overlay.querySelectorAll("style")]
    .map((style) => style.textContent ?? "")
    .join("\n")
    .split("\n");
  const at = lines.findIndex((line) => line.includes(mark) && line.trim().endsWith("{"));
  expect(at, mark).toBeGreaterThanOrEqual(0);
  return {
    selector: lines[at]!.trim().slice(0, -1).trim().replaceAll("&", ".frame"),
    body: lines[at + 1]!.trim(),
  };
};

async function showBeat(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  new Coordinator(h.game, beat!).onUpdate({ deltaMS: 0 } as Clock);
  await flushMicrotasks(30);
}

describe("a style under @variant(shout) applies in another layout (#2741)", () => {
  test("the hud's frame matches the compiled rule while the shouted line is the newest, and stops at the next line", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await flushMicrotasks(10);
    h.jumpTo("start");
    await showBeat(h);
    const frame = h.overlay.querySelector(".hud .frame");
    const dialogue = h.overlay.querySelector(".textbox .dialogue");
    expect(frame).not.toBeNull();
    expect(dialogue).not.toBeNull();
    expect(frame!.closest(".hud")).not.toBe(dialogue!.closest(".textbox"));
    expect(dialogue!.textContent).toContain("I'm busy!");
    const shout = compiledRule(h, 'data-line-variant="shout"');
    const bunny = compiledRule(h, 'data-line-speaker="bunny"');
    expect(shout.body).toMatch(/^background-color:/);
    expect(bunny.body).toBe("opacity: 0.5;");
    expect(h.overlay.getAttribute("data-line-variant")).toBe("shout");
    expect(h.overlay.querySelector(shout.selector)).toBe(frame);
    expect(h.overlay.querySelector(bunny.selector)).toBe(frame);

    await showBeat(h);
    expect(h.overlay.hasAttribute("data-line-variant")).toBe(false);
    expect(h.overlay.querySelector(shout.selector)).toBeNull();
    expect(h.overlay.querySelector(bunny.selector)).toBe(frame);

    await showBeat(h);
    expect(h.overlay.hasAttribute("data-line-speaker")).toBe(false);
    expect(h.overlay.querySelector(bunny.selector)).toBeNull();
  });
});
