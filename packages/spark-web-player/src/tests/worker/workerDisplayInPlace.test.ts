// A display whose change is confined to the cursor's line puts the page in
// its frame in place: the worker's game connects no module, enters no scene
// again and predicts nothing again, and sends the page only what differs, and
// the page then shows the frame the full display shows. Anything else
// connects in full (#657).
//
// The frame is compared with a twin player that takes the same steps with
// the display in place refused, so that it displays each one in full over
// the same frames before it.
import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { afterEach, describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

define DUSK as image with
  src = "https://example.com/dusk.png"
end

define HAPPY as image with
  src = "https://example.com/happy.png"
end

define SAD as image with
  src = "https://example.com/sad.png"
end

define theme as audio with
  src = "https://example.com/theme.wav"
end

store open = true

-> start

scene start
  ((play music theme))
  [[show backdrop BG]]
  HERO:
    The first line.

  HERO:
    [[show portrait HAPPY]]
    The second line.

  [[show backdrop BG]]
  HERO:
    The third line.

  if open then
    choose
      * Go left
        Went left.
      * Go right
        Went right.
    end
  end
  The end of the scene.
end

scene other
  OTHER:
    Another scene's line.
end
`;

const lineIn = (text: string, find: string) =>
  text.split("\n").findIndex((l) => l.includes(find));
/** The line of the directive that shows the third line's backdrop. */
const BACKDROP = lineIn(SOURCE, "The third line.") - 2;
const PORTRAIT = lineIn(SOURCE, "[[show portrait HAPPY]]");
const SECOND = lineIn(SOURCE, "The second line.");
const MENU = lineIn(SOURCE, "if open then");

const harnesses: { dispose(): void }[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

/** Counts, on the worker's game, what a full display does and a display in
 *  place leaves out: a module connecting, a module entering a scene, the
 *  connect itself, and a display in place that went ahead. With `refuse`,
 *  the game refuses every display in place, which then connects in full. */
function watch(game: any, refuse: boolean) {
  const seen = { connected: 0, entered: 0, connects: 0, inPlace: 0 };
  for (const name of game._moduleNames as string[]) {
    const module = game._modules[name];
    const onConnected = module.onConnected.bind(module);
    module.onConnected = () => {
      seen.connected += 1;
      return onConnected();
    };
    const onEnterScene = module.onEnterScene.bind(module);
    module.onEnterScene = (...args: unknown[]) => {
      seen.entered += 1;
      return onEnterScene(...args);
    };
  }
  const connect = game.connect.bind(game);
  game.connect = (send: unknown) => {
    seen.connects += 1;
    return connect(send);
  };
  // A game that has no display in place connects every display in full.
  const connectInPlace = game.connectInPlace?.bind(game) ?? (async () => false);
  game.connectInPlace = async (send: unknown) => {
    const inPlace = !refuse && (await connectInPlace(send));
    if (inPlace) {
      seen.inPlace += 1;
    }
    return inPlace;
  };
  return {
    seen,
    reset() {
      seen.connected = seen.entered = seen.connects = seen.inPlace = 0;
    },
  };
}

/** A player at `line` of `text`, compiled and selected, with the worker's
 *  game watched from then on. */
async function player(text: string, line: number, refuse = false) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line },
  });
  harnesses.push(h);
  await h.compile();
  await h.select(line);
  await settle(40);
  const game = h.workerState.gameState.game!;
  const watched = watch(game, refuse);
  let current = text;
  let heard = h.toPage.length;
  /** Where `find` is, the first time after `after` when it is given. */
  const rangeOf = (find: string, after?: string) => {
    const offset = current.indexOf(find, after ? current.indexOf(after) : 0);
    expect(offset).toBeGreaterThanOrEqual(0);
    const at = (o: number) => {
      const before = current.slice(0, o).split("\n");
      return { line: before.length - 1, character: before.at(-1)!.length };
    };
    return { offset, range: { start: at(offset), end: at(offset + find.length) } };
  };
  return {
    h,
    game,
    watched,
    /** How the worker classified its last display. */
    lastClass: () => (h.workerState.player as any).lastDisplayClass?.(),
    /** Edit the script, replacing `find` (the first after `after`), and
     *  compile, as typing does. */
    async edit(find: string, replace: string, after?: string) {
      const { offset, range } = rangeOf(find, after);
      await h.edit([{ range, text: replace }]);
      current = current.slice(0, offset) + replace + current.slice(offset + find.length);
      await h.compile();
      await settle(40);
    },
    /** Highlight a suggestion that replaces `find`, previewed at `line`. */
    async suggest(find: string, replace: string, after?: string) {
      const { range } = rangeOf(find, after);
      await h.suggest([{ range, text: replace }], line);
    },
    /** What the worker sent the page since the last call. */
    sent() {
      const messages = h.toPage.slice(heard);
      heard = h.toPage.length;
      return messages;
    },
  };
}

type Player = Awaited<ReturnType<typeof player>>;

/** Take `steps` on a player at `line` of `text`, then on a twin that
 *  refuses every display in place, which connects in full for each of them
 *  over the same frames before it, and answer what each step returned on
 *  each. One after the other: a player's page and workspace are the
 *  process's own. */
async function twins<T>(
  text: string,
  line: number,
  steps: (p: Player, refused: boolean) => Promise<T>,
): Promise<{ a: T; full: T }> {
  const take = async (refuse: boolean) => {
    const p = await player(text, line, refuse);
    try {
      return await steps(p, refuse);
    } finally {
      harnesses.splice(harnesses.indexOf(p.h), 1);
      p.h.dispose();
    }
  };
  const a = await take(false);
  const full = await take(true);
  return { a, full };
}

/** Whether `node` is an image layer that paints nothing: one on its way out,
 *  which the page removes once its exit animation ends (jsdom runs none),
 *  holding no picture and no attribute, or the empty layer a layout declares
 *  in a slot, which a full display builds again in a slot that shows no
 *  picture and the clear that follows leaves there. */
const paintsNothing = (node: any) =>
  node.class === "instance" &&
  node.tag === "span" &&
  !node.children &&
  !node.attrs &&
  (node.style === undefined || node.style === "background-image: none;");

/** The overlay at rest, without the image layers that paint nothing. */
const atRest = (node: any): any => {
  if (!node || typeof node !== "object") {
    return node;
  }
  if (!node.children) {
    return node;
  }
  const { children, ...rest } = node;
  const kept = children.filter((child: any) => !paintsNothing(child)).map(atRest);
  return kept.length > 0 ? { ...rest, children: kept } : rest;
};

/** What a step left: the overlay, how the display was classified, what the
 *  game did and what it sent the page. */
const after = (p: Player) => ({
  frame: atRest(p.h.snapshotDOM()),
  kind: p.lastClass(),
  seen: { ...p.watched.seen },
  sent: p.sent(),
});

/** Whether a frame shows `text`. */
const shows = (frame: unknown, text: string) => JSON.stringify(frame).includes(text);

/** The messages that start a sound or load one into a player; the empty
 *  update that stops the typewriter after a display is silent. */
const sounds = (sent: any[]) =>
  sent.filter(
    (m) =>
      m?.method === "audio/load" ||
      (m?.method === "audio/update" && m.params?.updates?.length),
  );

/** What a display in place leaves out: no module connects or enters a
 *  scene, no reconcile pass, no prediction around the cursor again, and no
 *  sound, so the music the scene plays does not start again. */
const expectInPlace = (step: ReturnType<typeof after>, displays = 1) => {
  expect(step.seen).toMatchObject({ connects: 0, connected: 0, entered: 0, inPlace: displays });
  expect(step.kind).toEqual({ inPlace: true });
  const methods = step.sent.map((m) => m?.method);
  expect(methods).not.toContain("ui/reconcile-begin");
  expect(methods).not.toContain("ui/reconcile-sweep");
  expect(methods).not.toContain("assets/prefetch");
  expect(sounds(step.sent)).toEqual([]);
};

describe("a display confined to the cursor's line", () => {
  it.each([
    {
      change: "a portrait",
      line: PORTRAIT,
      find: "HAPPY]]",
      replace: "SAD]]",
      from: undefined,
      showing: "sad.png",
    },
    {
      change: "a line of dialogue",
      line: SECOND,
      find: "The second line.",
      replace: "The second line, edited.",
      from: undefined,
      showing: "The second line, edited.",
    },
    {
      change: "a backdrop",
      line: BACKDROP,
      find: "BG]]",
      replace: "DUSK]]",
      from: "The second line.",
      showing: "dusk.png",
    },
  ])(
    "shows $change changed by an edit in place, as a full display shows it",
    async ({ line, find, replace, from, showing }) => {
      const { a, full } = await twins(SOURCE, line, async (p) => {
        const start = after(p);
        await p.edit(find, replace, from);
        return { start, edited: after(p) };
      });
      expect(a.start.frame).toEqual(full.start.frame);
      expectInPlace(a.edited);
      expect(full.edited.seen).toMatchObject({ connects: 1, inPlace: 0 });
      expect(shows(a.edited.frame, showing)).toBe(true);
      expect(a.edited.frame).toEqual(full.edited.frame);
    },
    120_000,
  );

  it("puts a backdrop the beat no longer shows back to the one before it", async () => {
    const { a, full } = await twins(SOURCE, BACKDROP, async (p) => {
      await p.edit("BG]]", "DUSK]]", "The second line.");
      const dusk = after(p);
      // The directive shows its picture on another layer now: the backdrop
      // is the one the scene showed before the beat.
      await p.edit("backdrop DUSK", "portrait DUSK");
      return { dusk, moved: after(p) };
    });
    expect(shows(a.dusk.frame, "dusk.png")).toBe(true);
    expectInPlace(a.moved, 2);
    expect(shows(a.moved.frame, "bg.png")).toBe(true);
    expect(a.dusk.frame).toEqual(full.dusk.frame);
    expect(a.moved.frame).toEqual(full.moved.frame);
  }, 120_000);

  it("shows highlighted suggestions in place, as a full display shows them", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      // The first suggestion replaces the real program on the screen.
      await p.suggest("The second line.", "The suggested line.");
      const first = after(p);
      p.watched.reset();
      // The next replaces a suggestion.
      await p.suggest("The second line.", "The proposed line.");
      const next = after(p);
      p.watched.reset();
      // Closing the list shows the real program again.
      await p.h.closeSuggestions();
      return { first, next, closed: after(p) };
    });
    expect(a.first.kind).toEqual({ inPlace: false, reason: "swap" });
    expect(shows(a.first.frame, "The suggested line.")).toBe(true);
    expectInPlace(a.next);
    expect(shows(a.next.frame, "The proposed line.")).toBe(true);
    expect(shows(a.next.frame, "The suggested line.")).toBe(false);
    expect(a.closed.kind).toEqual({ inPlace: false, reason: "swap" });
    expect(a.closed.seen.inPlace).toBe(0);
    expect(shows(a.closed.frame, "The second line.")).toBe(true);
    for (const step of ["first", "next", "closed"] as const) {
      expect(a[step].frame).toEqual(full[step].frame);
    }
  }, 120_000);

  it("takes a menu's choices off the page, unclickable, when the beat no longer presents them", async () => {
    const { a, full } = await twins(SOURCE, MENU, async (p) => {
      const menu = after(p);
      const choice = [...p.h.overlay.querySelectorAll<HTMLElement>(".choice")].find((el) =>
        (el.textContent ?? "").includes("Go left"),
      );
      await p.edit("if open then", "if not open then");
      const edited = after(p);
      // The button the menu wrote is clicked: nothing answers it.
      const win = p.h.overlay.ownerDocument.defaultView as any;
      choice?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      await settle(40);
      return { menu, choice: Boolean(choice), edited, clicked: after(p) };
    });
    expect(shows(a.menu.frame, "Go left")).toBe(true);
    expect(a.choice).toBe(true);
    expectInPlace(a.edited);
    expect(shows(a.edited.frame, "Go left")).toBe(false);
    expect(shows(a.edited.frame, "The end of the scene.")).toBe(true);
    expect(a.edited.frame).toEqual(full.edited.frame);
    expect(a.clicked.frame).toEqual(a.edited.frame);
    expect(a.clicked.sent).toEqual([]);
  }, 120_000);
});

describe("a display that is not confined to the cursor's line", () => {
  it.each([
    {
      change: "another flow changed",
      act: (p: Player) => p.edit("Another scene's line.", "Another scene's edited line."),
    },
    {
      change: "the state before the beat changed (an earlier line of the scene)",
      act: (p: Player) => p.edit("The first line.", "The first line, edited."),
    },
    {
      change: "the cursor moved to another beat",
      reason: "point",
      act: (p: Player) => p.h.select(lineIn(SOURCE, "The third line.")),
    },
    {
      change: "the scene map changed (the beat no longer shows a picture)",
      line: BACKDROP,
      reason: "scenes",
      act: (p: Player) => p.edit("[[show backdrop BG]]", "", "The second line."),
    },
    {
      change: "the context changed (a file was added)",
      act: async (p: Player) => {
        await p.h.page.sendRequest(AddCompilerFileMessage.type, {
          file: {
            uri: "file:///local/images/extra.png",
            name: "extra",
            ext: "png",
            type: "image",
            src: "https://example.com/extra.png",
            version: 1,
          },
        } as any);
        await p.h.compile();
        await settle(40);
      },
    },
    {
      change: "a suggestion's program replaced the real one",
      reason: "swap",
      act: (p: Player) => p.suggest("The second line.", "The suggested line."),
    },
    {
      change: "the application is new",
      reason: "unshown",
      act: async (p: Player) => {
        const answer = await p.h.link.request(DisplayPreviewMessage.type, {
          program: programIdentity(p.game.program)!,
          file: MAIN_URI,
          line: SECOND,
          speculative: false,
          fresh: true,
        });
        expect(answer.displayed).toBe(true);
        await settle(40);
      },
    },
  ])(
    "connects in full when $change",
    async ({
      line,
      reason,
      act,
    }: {
      line?: number;
      reason?: string;
      act: (p: Player) => Promise<unknown>;
    }) => {
      const p = await player(SOURCE, line ?? SECOND);
      await act(p);
      const kind = p.lastClass();
      expect(kind?.inPlace).toBe(false);
      if (reason) {
        expect(kind).toEqual({ inPlace: false, reason });
      }
      expect(p.watched.seen.connects).toBeGreaterThan(0);
      expect(p.watched.seen.inPlace).toBe(0);
    },
    120_000,
  );
});
