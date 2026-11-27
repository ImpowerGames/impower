import { expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `define MARA as character with
  name = "MARA"
end
style choices {
  transition = opacity 4s
  @hide { opacity = 0 }
}
scene start
  MARA: Stay or go?
  choose
    + [Stay.]
      MARA: Stayed.
    + [Go.]
      MARA: Gone.
  end
end
`;

type H = ReturnType<typeof createDOMHarness>;

async function tick(h: H) {
  for (let i = 0; i < 12; i++) {
    await flushMicrotasks(15);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
  }
}

async function menu(source = SOURCE) {
  const h = createDOMHarness(source, 0, { autoOpenAll: false });
  await h.ready;
  h.game.context.system.previewing = undefined;
  h.game.start();
  await tick(h);
  h.game.clickedToContinue();
  await tick(h);
  expect(h.overlay.querySelectorAll(".layout_choices")).toHaveLength(1);
  expect((h.game as any)._coordinator._instructions.choices).toHaveLength(2);
  return h;
}

function holdHide(h: H) {
  const original = h.ui.onReceiveRequest.bind(h.ui);
  let release!: () => void;
  let held = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.ui.onReceiveRequest = async (message: any) => {
    const result = await original(message);
    if (
      message.method === "ui/presence" &&
      message.params.effects.some((effect: any) => effect.presence === "hide")
    ) {
      held++;
      await pending;
    }
    return result;
  };
  return { release, held: () => held };
}

function pick(h: H, index = 0) {
  const id = h.game.module.ui.findIds(`choice ${index}`)[0]!;
  const el = h.overlay.ownerDocument.getElementById(id)!;
  el.dispatchEvent(
    new h.overlay.ownerDocument.defaultView!.MouseEvent("click", {
      bubbles: true,
      button: 0,
    }),
  );
}

const menus = (h: H) =>
  Array.from(h.overlay.querySelectorAll(".layout_choices")).map(
    (el) => el.textContent,
  );

test("a step back while choices is leaving removes the leaving options and shows the menu once", async () => {
  const h = await menu();
  const held = holdHide(h);
  pick(h);
  await tick(h);
  expect(held.held()).toBeGreaterThan(0);
  const back = await h.game.rollBack("beat");
  await tick(h);
  expect(back.moved).toBe(true);
  expect(menus(h)).toEqual(["Stay.Go."]);
  held.release();
  await tick(h);
  expect(menus(h)).toEqual(["Stay.Go."]);
});

test("a pick that ends the story keeps its options, unpressable, until choices finishes leaving", async () => {
  const h = await menu(SOURCE.replace("MARA: Stayed.", "-> DONE"));
  const held = holdHide(h);
  pick(h);
  await tick(h);
  expect(h.game.ending).toBeTruthy();
  expect(held.held()).toBeGreaterThan(0);
  const options = h.overlay.querySelectorAll<HTMLElement>(".choice");
  expect(options).toHaveLength(6);
  expect(options[0]!.textContent).toBe("Stay.");
  expect(options[0]!.style.display).not.toBe("none");
  expect(options[0]!.hasAttribute("data-ui-handler")).toBe(false);
  held.release();
  await tick(h);
  expect(menus(h)).toEqual([]);
});

test("an author's own option buttons hide at the pick, as before", async () => {
  const source = `layout main {
  dialogue #clear { text }
  choice.0 #clear { text }
  choice.1 #clear { text }
}
${SOURCE}`;
  const h = createDOMHarness(source, 0, { autoOpenAll: false });
  await h.ready;
  h.game.context.system.previewing = undefined;
  h.game.start();
  await tick(h);
  h.game.clickedToContinue();
  await tick(h);
  expect(menus(h)).toEqual([]);
  const buttons = Array.from(h.overlay.querySelectorAll<HTMLElement>(".choice"));
  expect(buttons).toHaveLength(2);
  pick(h);
  await tick(h);
  expect(buttons.map((el) => el.style.display)).toEqual(["none", "none"]);
});

test("switching a live menu to the text page leaves only the page's options", async () => {
  const h = await menu();
  expect(h.game.setStartingDisplayMode("textstream")).toBe(true);
  await tick(h);
  expect(h.overlay.querySelectorAll(".textstream_option")).toHaveLength(2);
  expect(menus(h)).toEqual([]);

  expect(h.game.setStartingDisplayMode("textbox")).toBe(true);
  await tick(h);
  expect(h.overlay.querySelectorAll(".textstream_option")).toHaveLength(0);
  expect(menus(h)).toEqual(["Stay.Go."]);
});
