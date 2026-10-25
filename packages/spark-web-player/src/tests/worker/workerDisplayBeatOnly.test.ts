// A display whose state before the beat is unchanged is beat-only (#657):
// the worker's game connects no module, enters no scene again and predicts
// nothing again, the screen's structure stands, and the page reconciles the
// restored content and the beat in a content pass. The page then shows the
// frame a full display shows. Anything else connects in full, and each
// reason has a test below, named after the condition (a) to (i) of the
// design on #657.
//
// The frame is compared with a twin player that takes the same steps with
// every display refused beat-only, so that it displays each one in full over
// the same frames before it. The fixtures of the in-place design that came
// before this one (PR #1806) are kept, each case it found pinned again here.
import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  HERO:
    [[show portrait SAD]]
    The fourth line.
    And a fifth.

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

store late = 1
`;

const lineIn = (text: string, find: string) =>
  text.split("\n").findIndex((l) => l.includes(find));
/** The line of the directive that shows the third line's backdrop. */
const BACKDROP = lineIn(SOURCE, "The third line.") - 2;
const PORTRAIT = lineIn(SOURCE, "[[show portrait HAPPY]]");
const SECOND = lineIn(SOURCE, "The second line.");
const MENU = lineIn(SOURCE, "if open then");
const FOURTH = lineIn(SOURCE, "The fourth line.");

/** A main layout of its own whose badge shows the picture a variable names,
 *  which a mount resolves and no turn refreshes. */
const BOUND = `define HAPPY as image with
  src = "https://example.com/happy.png"
end

define SAD as image with
  src = "https://example.com/sad.png"
end

store pic = "HAPPY"

function set_pic(name)
  pic = name
  return ""
end

layout main with
  stage {
    badge {
      image "{pic}"
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: {set_pic("HAPPY")}First. > Second.
end
`;
/** A line whose first beat sets the picture the badge names, and whose last
 *  beat the preview shows. */
const SETS = lineIn(BOUND, "First. > Second.");

/** A main layout of its own whose dialogue slot is mounted by one branch of
 *  an `if` or the other, which the first beat of the cursor's line picks. */
const BRANCHED = `store mode = false

function set_mode(v)
  mode = v
  return ""
end

layout main with
  textbox {
    if mode then
      dialogue {
        text
      }
    else
      dialogue {
        text
      }
    end
  }
end

-> start

scene start
  Before.
  HERO: {set_mode(true)}First. > Second.
end
`;
const PICKS = lineIn(BRANCHED, "First. > Second.");

/** The same, with the `if` inside the dialogue slot: the slot stays mounted
 *  and the branch mounts its text leaf again. */
const BRANCHED_INSIDE = BRANCHED.replace(
  `    if mode then
      dialogue {
        text
      }
    else
      dialogue {
        text
      }
    end`,
  `    dialogue {
      if mode then
        text
      else
        text
      end
    }`,
);

/** A main layout of its own with one element that two text targets name,
 *  the character's name and the dialogue, so a write or a clear of either
 *  reaches what the other wrote. */
const SHARED = `layout main with
  textbox {
    character_name.dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: First.
  HERO: Second.
end
`;
const SAYS = lineIn(SHARED, "HERO: Second.");

/** Two targets with text of their own on elements of their own, which the
 *  other branch of an `if` merges into one element that both name. */
const MERGED = `store mode = false

function set_mode(v)
  mode = v
  return ""
end

layout main with
  textbox {
    if mode then
      title.action {
        text "Slot:"
      }
    else
      title {
        text "Slot:"
      }
      action {
        text "Slot:"
      }
    end
  }
end

-> start

scene start
  ^: Heading.
  {set_mode(false)}First. > Second.
end
`;
const MERGES = lineIn(MERGED, "First. > Second.");

/** The same, with a badge always mounted whose binding counts the times
 *  it is evaluated in the story's state. */
const COUNTED = MERGED.replace(
  "store mode = false\n",
  `store mode = false
store evaluations = 0

function bump()
  evaluations = evaluations + 1
  return evaluations
end
`,
).replace(
  "  textbox {\n    if mode then",
  `  textbox {
    badge {
      text "{bump()}"
    }
    if mode then`,
);

/** Three badges whose bindings count their own evaluations, the middle one
 *  inside an \`if\`, around a dialogue slot: building them evaluates them in
 *  one order, and a refresh would in another (#1806, round 6). */
const ORDERED = `store visible = true
store evaluations = 0

function bump()
  evaluations = evaluations + 1
  return evaluations
end

layout main with
  textbox {
    badge {
      text "{bump()}"
    }
    if visible then
      badge {
        text "{bump()}"
      }
    end
    dialogue {
      text
    }
    badge {
      text "{bump()}"
    }
  }
end

-> start

scene start
  HERO: First. > Second.
end
`;

/** One element that the backdrop and the portrait targets both name, under
 *  a directive an edit moves from one to the other. */
const SWAPPED = `define HAPPY as image with
  src = "https://example.com/happy.png"
end

layout main with
  stage {
    backdrop.portrait {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  HERO:
    Before.

  HERO:
    [[show portrait HAPPY]]
    Then it rained.
end
`;
const RAINED = lineIn(SWAPPED, "[[show portrait HAPPY]]");

/** A main layout of its own whose dialogue target has text of its own, so
 *  it is no transient target: a beat adds to it rather than replacing it. */
const PERSISTENT = `store word = "First."

function set_word(v)
  word = v
  return ""
end

layout main with
  textbox {
    dialogue {
      text "Says:"
    }
  }
end

-> start

scene start
  Before.
  HERO: {set_word("First.")}{word} > Second.
end
`;
const ACTS = lineIn(PERSISTENT, "> Second.");

/** A layout's placeholder (§4.3) in a target the beat writes, which an edit
 *  makes a beat that writes another target instead. */
const PLACEHOLDER = `layout main with
  textbox {
    character_name {
      text
    }
    dialogue {
      text "Says:"
    }
    action {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO:
    Spoken.
end
`;
const SPOKEN = lineIn(PLACEHOLDER, "Spoken.");

/** A layout that shows the filtered picture a directive of the scene
 *  implies, which a suggestion for that directive no longer implies. */
const IMPLIED = `define HAPPY as image with
  src = "https://example.com/happy.png"
end

layout main with
  stage {
    portrait {
      image
    }
    badge {
      image "HAPPY~sad"
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO:
    [[show portrait HAPPY:sad]]
    Then it rained.
end
`;
const IMPLIES = lineIn(IMPLIED, "[[show portrait HAPPY:sad]]");

/** A beat that opens a layout of its own. */
const OPENS = `layout main with
  textbox {
    dialogue {
      text
    }
  }
end

layout hud with
  stats {
    text "HUD"
  }
end

-> start

scene start
  Before.
  HERO:
    [[open hud]]
    Opened.
end
`;
const OPENED = lineIn(OPENS, "Opened.");

/** A beat before the cursor's in a branch the route never takes: the route
 *  to a line takes a conditional's first branch, and so never this `else`. */
const UNTAKEN = `define HAPPY as image with
  src = "https://example.com/happy.png"
end

store skip = true

-> start

scene start
  HERO:
    Taken.

  if skip then
    HERO:
      Taken branch.
  else
    HERO:
      Never said.
  end

  HERO:
    [[show portrait HAPPY]]
    The said line.
end
`;
const SAID = lineIn(UNTAKEN, "The said line.");

/** The overlay a full display of `text` at `line` leaves on a page that
 *  showed nothing before: a player of its own. */
/** A badge bound to a variable that a button sets, and that the statement
 *  of the cursor's beat sets before it speaks (round 1 of #1878): the
 *  route's checkpoint, taken at that statement, holds what it wrote. */
const BADGED = `store mode = false

function set_mode(v)
  mode = v
  return ""
end

layout main with
  button "Unset" @click=set_mode(false)
  badge {
    text "{mode}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: {set_mode(true)}Spoken.
end
`;
const SETS_MODE = lineIn(BADGED, "Spoken.");

/** The same, set by a beat the route passes before the cursor's, whose own
 *  statement writes nothing. */
const BADGED_BEFORE = BADGED.replace(
  `  Before.
  HERO: {set_mode(true)}Spoken.`,
  `  HERO: {set_mode(true)}Before.
  HERO: Spoken.`,
);
const SPEAKS = lineIn(BADGED_BEFORE, "HERO: Spoken.");

/** `BADGED` with the flag kept in a stored table, which the beat's
 *  statement changes in place through `rawset`: the write barrier marks it,
 *  and the reactive change set does not (round 1 of #1878). */
const RAWSET = BADGED.replace("store mode = false", "store flags = { mode = false }")
  .replace("  mode = v\n", '  rawset(flags, "mode", v)\n')
  .replace('text "{mode}"', 'text "{flags.mode}"');

/** A layout whose binding changes a stored table in place, through
 *  `rawset`, while the tree is built. */
const RAWSET_BUILD = `store counter = { n = 0 }

function bump()
  rawset(counter, "n", counter.n + 1)
  return ""
end

layout main with
  badge {
    text "{bump()}"
  }
  tally {
    text "{counter.n}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: Spoken.
end
`;

/** A layout whose binding reads the host's clock, or draws a random
 *  number: evaluating it again may give another value. */
const READS = (binding: string) => `layout main with
  badge {
    text "{${binding}}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: Spoken.
end
`;

/** A badge showing how many times a function was called: a call counts a
 *  visit, which no write mark sees (round 2 of #1878). The beat's statement
 *  calls it. */
const VISITED = `function f()
  return ""
end

layout main with
  badge {
    text "{count.visits(-> f)}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: {f()}Spoken.
end
`;

/** A beat whose statement interpolates `call` (none when empty), and a
 *  badge whose binding is `bound`, with a user function `shout` that writes
 *  nothing. */
const CALLING = (call: string, bound: string) => `function shout(s)
  return s
end

layout main with
  badge {
    text "{${bound}}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: ${call ? `{${call}}` : ""}Spoken.
end
`;

/** A stored value the scene sets, before the cursor's beat, from what no
 *  story state holds: the route's own steps read it (round 2 of #1878). */
const STAMPED = (value: string) => `store stamp = 0

layout main with
  badge {
    text "{stamp}"
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  stamp = ${value}
  HERO: Spoken.
end
`;

/** A menu kept on the page under a badge bound to a variable, whose option
 *  says how many times its scene was entered (round 3 of #1878): a full
 *  display evaluates the badge, and the choice counts the scene it leaves by
 *  where the story last ran. An untaken branch before the menu holds the
 *  edit. */
const RETAINED = `store stamp = 7
store skip = true

layout main with
  badge {
    text "{stamp}"
  }
  choices {
    choice.0 {
      text
    }
  }
  textbox {
    dialogue {
      text
    }
    action {
      text
    }
  }
end

-> start

scene start
  Before.
  if skip then
    Taken branch.
  else
    Never said.
  end
  choose
    * Go on
      The scene was visited {count.visits(-> start)} times.
  end
end
`;

/** An input whose handler writes nothing: what the viewer types changes
 *  the page, and the worker sends nothing back. */
const TYPED = `store name = "Zelda"

layout main with
  input #value={name} @input={ }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  Before.
  HERO: Spoken.
end
`;
const TYPES = lineIn(TYPED, "HERO: Spoken.");

/** What the badge of `BADGED` shows. */
const badge = (p: { h: { overlay: HTMLElement } }) =>
  (p.h.overlay.querySelector(".badge")?.textContent ?? "").trim();

async function freshFrame(text: string, line: number) {
  const p = await player(text, line);
  try {
    return after(p).frame;
  } finally {
    harnesses.splice(harnesses.indexOf(p.h), 1);
    p.h.dispose();
  }
}

/** Counts the overlay's mutations while a step runs: those inside the
 *  portrait, the character's name and the dialogue, and every element given
 *  `display: none`. */
function mutations(p: { h: { overlay: HTMLElement } }) {
  const win = p.h.overlay.ownerDocument.defaultView as any;
  const counts = { portrait: 0, name: 0, dialogue: 0, hidden: 0 };
  const within = (node: Node | null, name: string) => {
    for (let n = node as HTMLElement | null; n; n = n.parentElement) {
      if (n.classList?.contains(name)) {
        return true;
      }
    }
    return false;
  };
  const count = (records: MutationRecord[]) => {
    for (const r of records) {
      const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (within(node, "portrait")) counts.portrait += 1;
      if (within(node, "character_name")) counts.name += 1;
      if (within(node, "dialogue")) counts.dialogue += 1;
      if (
        r.type === "attributes" &&
        r.attributeName === "style" &&
        (r.target as HTMLElement).style?.display === "none"
      ) {
        counts.hidden += 1;
      }
    }
  };
  const observer = new win.MutationObserver(count);
  observer.observe(p.h.overlay, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  return () => {
    count(observer.takeRecords());
    observer.disconnect();
    return counts;
  };
}

const harnesses: { dispose(): void }[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

/** Counts, on the worker's game, what a full display does and a beat-only
 *  display leaves out: a module connecting, a module entering a scene, the
 *  connect itself, and a redisplay. With `refuse`, the game refuses every
 *  display beat-only, which then connects in full. */
function watch(game: any, refuse: boolean) {
  const seen = { connected: 0, entered: 0, connects: 0, redisplays: 0 };
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
  // A game with no redisplay connects every display.
  if (game.redisplay && game.beatOnlyRefusal) {
    const redisplay = game.redisplay.bind(game);
    game.redisplay = (send: unknown) => {
      seen.redisplays += 1;
      return redisplay(send);
    };
    const refusal = game.beatOnlyRefusal.bind(game);
    game.beatOnlyRefusal = (cursor: unknown) =>
      refuse ? "refused" : refusal(cursor);
  }
  return {
    seen,
    reset() {
      seen.connected = seen.entered = seen.connects = seen.redisplays = 0;
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
    /** How the worker's last display went. */
    lastPath: () => (h.workerState.player as any).lastDisplayPath?.(),
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
 *  refuses every display beat-only, which connects in full for each of them
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

/** Every message a stream carries, the ops inside a `ui/beat` and a
 *  `ui/batch` among them, in order. */
const ops = (sent: any[]): any[] =>
  sent.flatMap((m) =>
    m?.method === "ui/beat"
      ? ops(m.params.messages)
      : m?.method === "ui/batch"
        ? [m, ...ops(m.params.messages)]
        : [m],
  );

/** What a step left: the overlay, how its last display went, what the game
 *  did and what it sent the page, and the worker's answer to each display
 *  the step asked for. The counts start again for the next step. */
const after = (p: Player) => {
  const sent = p.sent();
  const step = {
    frame: atRest(p.h.snapshotDOM()),
    path: p.lastPath(),
    seen: { ...p.watched.seen },
    sent,
    answers: sent
      .filter((m) => m?.result && typeof m.result === "object" && "displayed" in m.result)
      .map((m) => m.result),
    /** What the watches behind the `calls` gate found: whether the last
     *  replay's target wrote the story's state, and whether the tree the
     *  game holds was built without writing it or reading an ambient value. */
    targetWrote: (p.game as any)._routeTargetWrote as boolean | undefined,
    treePure: (p.game.module.ui as any)._tree?.pure as boolean | undefined,
  };
  p.watched.reset();
  return step;
};

/** The letters a frame's text targets show, in document order. */
const letters = (node: any): string =>
  (node.class === "text_letter" ? (node.text ?? "") : "") +
  (node.children ?? []).map(letters).join("");

/** Whether a frame shows `text`. */
const shows = (frame: unknown, text: string) => JSON.stringify(frame).includes(text);

/** The messages that start a sound or load one into a player; the empty
 *  update that stops the typewriter after a display is silent. */
const sounds = (sent: any[]) =>
  ops(sent).filter(
    (m) =>
      m?.method === "audio/load" ||
      (m?.method === "audio/update" &&
        m.params?.updates?.some((u: any) => u?.control === "start")),
  );

/** What a beat-only display leaves out: no module connects or enters a
 *  scene, no element of the tree is sent again, nothing is predicted again,
 *  and no sound starts, so the music the scene plays does not start again.
 *  It opens a content pass and sweeps it. */
const expectBeatOnly = (step: ReturnType<typeof after>, displays = 1) => {
  expect(step.path).toEqual({ beatOnly: true });
  expect(step.seen).toMatchObject({ connects: 0, connected: 0, entered: 0, redisplays: displays });
  const all = ops(step.sent);
  const methods = all.map((m) => m?.method);
  expect(all.filter((m) => m?.method === "ui/reconcile-begin").map((m) => m.params)).toEqual(
    Array(displays).fill({ content: true }),
  );
  expect(methods).not.toContain("ui/create");
  expect(methods).not.toContain("assets/prefetch");
  expect(methods).not.toContain("assets/configure");
  expect(sounds(step.sent)).toEqual([]);
  expect(step.sent.filter((m) => m?.method === "ui/beat" && m.params.sweep)).toHaveLength(displays);
};

/** What a full display does: it connects. */
const expectFull = (step: ReturnType<typeof after>, refused: string) => {
  expect(step.path).toEqual({ beatOnly: false, refused });
  expect(step.seen.connects).toBeGreaterThan(0);
  expect(step.seen.redisplays).toBe(0);
};

describe("a beat-only display", () => {
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
    "shows $change changed by an edit, as a full display shows it, without connecting",
    async ({ line, find, replace, from, showing }) => {
      const { a, full } = await twins(SOURCE, line, async (p) => {
        const start = after(p);
        await p.edit(find, replace, from);
        return { start, edited: after(p) };
      });
      expect(a.start.frame).toEqual(full.start.frame);
      expectBeatOnly(a.edited);
      expectFull(full.edited, "refused");
      expect(shows(a.edited.frame, showing)).toBe(true);
      expect(a.edited.frame).toEqual(full.edited.frame);
    },
    120_000,
  );

  it.each([
    { change: "a portrait", line: PORTRAIT, find: "HAPPY]]", replace: "SAD]]", showing: "sad.png" },
    { change: "a line of dialogue", line: SECOND, find: "The second line.", replace: "The proposed line.", showing: "The proposed line." },
  ])(
    "shows $change changed by the next highlighted suggestion, as a full display shows it",
    async ({ line, find, replace, showing }) => {
      const { a, full } = await twins(SOURCE, line, async (p) => {
        // The first suggestion replaces the real program on the screen.
        await p.suggest(find, find.replace(/HAPPY|second/, (w) => (w === "HAPPY" ? "BG" : "suggested")));
        const first = after(p);
        // The next replaces a suggestion.
        await p.suggest(find, replace);
        const next = after(p);
        // Closing the list shows the real program again.
        await p.h.closeSuggestions();
        return { first, next, closed: after(p) };
      });
      expectFull(a.first, "swap");
      expectBeatOnly(a.next);
      expect(shows(a.next.frame, showing)).toBe(true);
      expectFull(a.closed, "swap");
      for (const step of ["first", "next", "closed"] as const) {
        expect(a[step].frame).toEqual(full[step].frame);
      }
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
    expectBeatOnly(a.dusk);
    expectBeatOnly(a.moved);
    expect(shows(a.moved.frame, "bg.png")).toBe(true);
    expect(a.dusk.frame).toEqual(full.dusk.frame);
    expect(a.moved.frame).toEqual(full.moved.frame);
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
    expectBeatOnly(a.edited);
    expect(shows(a.edited.frame, "Go left")).toBe(false);
    expect(shows(a.edited.frame, "The end of the scene.")).toBe(true);
    expect(a.edited.frame).toEqual(full.edited.frame);
    expect(a.clicked.frame).toEqual(a.edited.frame);
    expect(a.clicked.sent).toEqual([]);
  }, 120_000);

  it("leaves a kept menu's story where a full display leaves it, though the full display evaluated the badge's binding", async () => {
    const { a, full } = await twins(RETAINED, lineIn(RETAINED, "  choose"), async (p) => {
      // An edit the route never runs, so the menu, one statement with its
      // options, stays the route's.
      await p.edit("Never said.", "Never, ever said.");
      const edited = after(p);
      const state: any = (p.game.story as any).state;
      // Where the story last ran: a choice reads the flow it leaves from it,
      // and counts the flows it enters by it. A preview runs on past no
      // choice, so a played game's continuation is the engine's own test
      // (bindingEvaluationKeepsChoiceFlow).
      return { edited, at: [state.previousFlow, state.previousAddress] };
    });
    expectBeatOnly(a.edited);
    expect(a.at).toEqual(full.at);
  }, 120_000);

  it("starts no sound, so the scene's music does not start again", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      await p.edit("The second line.", "The second line, edited.");
      return after(p);
    });
    expectBeatOnly(a);
    expect(sounds(a.sent)).toEqual(sounds(full.sent));
  }, 120_000);

  it("rewrites only the changed dialogue: the name and the portrait are not touched", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      const stop = mutations(p);
      await p.edit("The second line.", "The second line, edited.");
      return { ...after(p), mutated: stop() };
    });
    expectBeatOnly(a);
    expect(a.frame).toEqual(full.frame);
    // No more than a full display: nothing is hidden on the way, and the
    // name and the portrait, which the edit leaves as they were, are touched
    // no more than a full display touches them.
    expect(a.mutated.hidden).toBe(0);
    for (const region of ["portrait", "name", "dialogue", "hidden"] as const) {
      expect(a.mutated[region]).toBeLessThanOrEqual(full.mutated[region]);
    }
  }, 120_000);

  it("shows an edit of another line of the beat under the cursor, as a full display shows it", async () => {
    const { a, full } = await twins(SOURCE, FOURTH, async (p) => {
      await p.edit("And a fifth.", "And a sixth.");
      return after(p);
    });
    expectBeatOnly(a);
    expect(shows(a.frame, "And a sixth.")).toBe(true);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("shows what a full display shows when a breakpoint stops the beat", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      p.game.setBreakpoints([{ file: MAIN_URI, line: SECOND }]);
      await p.edit("The second line.", "The second line, edited.");
      return after(p);
    });
    expect(a.path).toEqual({ beatOnly: true });
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("follows a beat-only display with a full one and a full one with a beat-only one, as full displays show them", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      await p.edit("The second line.", "The second line, edited.");
      const beat = after(p);
      // An earlier line: the state before the beat changed.
      await p.edit("The first line.", "The first line, edited.");
      const connected = after(p);
      await p.edit("The second line, edited.", "The second line, again.");
      return { beat, connected, again: after(p) };
    });
    expectBeatOnly(a.beat);
    expectFull(a.connected, "checkpoint");
    expectBeatOnly(a.again);
    for (const step of ["beat", "connected", "again"] as const) {
      expect(a[step].frame).toEqual(full[step].frame);
    }
  }, 120_000);

  it("starts PLAY over a beat-only display as it starts it over a full one", async () => {
    const { a, full } = await twins(SOURCE, SECOND, async (p) => {
      await p.edit("The second line.", "The second line, edited.");
      const shown = after(p);
      await p.h.controller.startGameAndApp();
      await settle(80);
      const playing = after(p);
      return { shown, playing };
    });
    expectBeatOnly(a.shown);
    expect(a.playing.frame).toEqual(full.playing.frame);
  }, 120_000);

  it("keeps the pictures the standing screen shows resident across a display with a new portrait", async () => {
    const { a, full } = await twins(SOURCE, PORTRAIT, async (p) => {
      await p.edit("HAPPY]]", "SAD]]");
      return after(p);
    });
    expectBeatOnly(a);
    // What the page loads and lets go is what a full display has it load
    // and let go, apart from the restore's wait for pictures already on
    // the page: the backdrop the screen shows stays where it is.
    const assets = (sent: any[]) =>
      ops(sent)
        .filter((m) => m?.method === "assets/release" || m?.method === "assets/load")
        .map((m) => ({
          method: m.method,
          pins: m.params.pins ?? (m.params.pin != null ? [m.params.pin] : []),
          items: (m.params.items ?? []).map((i: any) => i.src ?? i.url ?? i.name),
        }));
    const notRestore = (m: { pins: string[] }) => !m.pins.includes("restore");
    expect(assets(a.sent).filter(notRestore)).toEqual(assets(full.sent).filter(notRestore));
    // Nothing the standing screen shows was let go.
    expect(assets(a.sent).filter((m) => !notRestore(m))).toEqual([]);
    expect(shows(a.frame, "bg.png")).toBe(true);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("leaves the prediction window as a full display at the same point leaves it", async () => {
    const { a, full } = await twins(SOURCE, PORTRAIT, async (p) => {
      await p.edit("HAPPY]]", "SAD]]");
      const edited = after(p);
      // The next suggestion finds the same pictures warm.
      await p.suggest("SAD]]", "BG]]");
      return { edited, window: (p.game.module.assets as any)._previewWindow, next: after(p) };
    });
    expectBeatOnly(a.edited);
    expect(a.window).toEqual(full.window);
    const prefetched = (sent: any[]) =>
      ops(sent).filter((m) => m?.method === "assets/prefetch").map((m) => m.params);
    expect(prefetched(a.edited.sent)).toEqual(prefetched(full.edited.sent));
    expect(prefetched(a.next.sent)).toEqual(prefetched(full.next.sent));
    expect(a.next.frame).toEqual(full.next.frame);
  }, 120_000);

  it("neither previews nor sweeps a beat-only display taken over by a newer one, and connects the next in full", async () => {
    const p = await player(SOURCE, SECOND);
    // The first suggestion swaps the real program out, in full.
    await p.suggest("The second line.", "The line zero.");
    expect(after(p).answers).toEqual([
      expect.objectContaining({ displayed: true, path: "full", refused: "swap" }),
    ]);
    // The next one's preview is held until a newer one has taken it over.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const game = p.game as any;
    const preview = game.preview.bind(game);
    let previews = 0;
    game.preview = async (...args: unknown[]) => {
      previews += 1;
      if (previews === 1) {
        await held;
      }
      return preview(...args);
    };
    const first = p.suggest("The second line.", "The line one.");
    await settle(200);
    // The held display is beat-only: it redisplayed, and stands in its
    // preview.
    expect(p.watched.seen).toMatchObject({ redisplays: 1, connects: 0 });
    expect(previews).toBe(1);
    const second = p.suggest("The second line.", "The line two.");
    await settle(200);
    release();
    await Promise.all([first, second]);
    await settle(80);
    const overtaken = after(p);
    // The held display answers that it did not go up, and the display that
    // took it over connects in full, the page holding nothing of the one
    // before it.
    expect(overtaken.answers).toContainEqual({ displayed: false });
    expect(overtaken.answers).toContainEqual(
      expect.objectContaining({ displayed: true, path: "full", refused: "unshown" }),
    );
    expect(letters(overtaken.frame)).toContain("The line two.");
    expect(letters(overtaken.frame)).not.toContain("The line one.");
    // The display after it is beat-only again.
    await p.suggest("The second line.", "The line three.");
    expectBeatOnly(after(p));
  }, 120_000);
});

describe("the classes the in-place design found (#1806)", () => {
  it("shows a layout's bound picture as the loaded state names it (class 1)", async () => {
    const { a, full } = await twins(BOUND, SETS, async (p) => {
      const start = after(p);
      await p.edit('set_pic("HAPPY")', 'set_pic("SAD")');
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expect(a.edited.frame).not.toEqual(a.start.frame);
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it.each([
    { fixture: "BRANCHED", text: BRANCHED, line: PICKS },
    { fixture: "BRANCHED_INSIDE", text: BRANCHED_INSIDE, line: lineIn(BRANCHED_INSIDE, "First. > Second.") },
  ])("writes a slot the layout mounted again, as a full display does (class 2, $fixture)", async ({ text, line }) => {
    const { a, full } = await twins(text, line, async (p) => {
      const start = after(p);
      await p.edit("set_mode(true)", "set_mode(false)");
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expect(letters(a.edited.frame)).toContain("Second.");
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("replaces a persistent target's text, as a full display and a fresh page do (class 3)", async () => {
    const { a, full } = await twins(PERSISTENT, ACTS, async (p) => {
      await p.edit('set_word("First.")', 'set_word("Premier.")');
      return after(p);
    });
    expect(letters(a.frame)).not.toContain("First.");
    expect(a.frame).toEqual(full.frame);
    expect(a.frame).toEqual(
      await freshFrame(PERSISTENT.replace('set_word("First.")', 'set_word("Premier.")'), ACTS),
    );
  }, 120_000);

  it("shows what two targets naming one element show, as a full display does (class 4)", async () => {
    const { a, full } = await twins(SHARED, SAYS, async (p) => {
      const start = after(p);
      await p.edit("Second.", "Third.");
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expectBeatOnly(a.edited);
    expect(letters(a.edited.frame)).toContain("Third.");
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("clears what another target shows on the element a beat writes, as a full display does (class 4)", async () => {
    const { a, full } = await twins(SWAPPED, RAINED, async (p) => {
      const start = after(p);
      await p.edit("portrait HAPPY", "backdrop HAPPY");
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expect(shows(full.edited.frame, "happy.png")).toBe(true);
    expectBeatOnly(a.edited);
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("shows the element the loaded state merges two targets into, as a full display does (class 5)", async () => {
    const { a, full } = await twins(MERGED, MERGES, async (p) => {
      const start = after(p);
      await p.edit("set_mode(false)", "set_mode(true)");
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("connects in full over a tree whose bindings write the story's state, and counts as a fresh page does (class 6)", async () => {
    const line = lineIn(COUNTED, "First. > Second.");
    const { a, full } = await twins(COUNTED, line, async (p) => {
      await p.edit("Second.", "Third.");
      return after(p);
    });
    expectFull(a, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(a.treePure).toBe(false);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("connects in full over bindings whose evaluation order would show (class 7)", async () => {
    const line = lineIn(ORDERED, "First. > Second.");
    const { a, full } = await twins(ORDERED, line, async (p) => {
      await p.edit("Second.", "Third.");
      return after(p);
    });
    expectFull(a, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(a.treePure).toBe(false);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("shows a layout's placeholder in a target the beat no longer writes, as a full display does (#1813)", async () => {
    const { a, full } = await twins(PLACEHOLDER, SPOKEN, async (p) => {
      const start = after(p);
      await p.edit("HERO:\n    Spoken.", "An action instead.");
      return { start, edited: after(p) };
    });
    expect(a.start.frame).toEqual(full.start.frame);
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);
});

describe("a display that connects in full", () => {
  it("(a) connects in full when the application is new (fresh)", async () => {
    const p = await player(SOURCE, SECOND);
    const answer = await p.h.link.request(DisplayPreviewMessage.type, {
      program: programIdentity(p.game.program)!,
      file: MAIN_URI,
      line: SECOND,
      speculative: false,
      fresh: true,
    });
    expect(answer).toMatchObject({ displayed: true, path: "full", refused: "fresh" });
    expect(p.lastPath()).toEqual({ beatOnly: false, refused: "fresh" });
  }, 120_000);

  it("(a) connects in full after PLAY has held the page", async () => {
    const p = await player(SOURCE, SECOND);
    expect(await p.h.controller.startGameAndApp()).toBe(true);
    await settle(80);
    // STOP waits a frame between its steps; this page has no frames.
    const win = p.h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    await p.h.controller.stopGame("quit");
    // The editor selects where the game stopped, as STOP asks it to.
    await p.h.select(SECOND);
    await settle(80);
    const stopped = after(p);
    // Every display after PLAY held the page connects in full, until one
    // has gone up.
    const shown = stopped.answers.filter((answer: any) => answer.displayed);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]).toMatchObject({ path: "full" });
    expect(["fresh", "unshown"]).toContain(shown[0].refused);
    expect(stopped.seen.redisplays).toBeLessThanOrEqual(shown.length - 1);
  }, 120_000);

  it("(b) connects in full when a suggestion's program replaces the real one, and the reverse", async () => {
    const p = await player(SOURCE, SECOND);
    await p.suggest("The second line.", "The suggested line.");
    expectFull(after(p), "swap");
    p.watched.reset();
    await p.h.closeSuggestions();
    expectFull(after(p), "swap");
  }, 120_000);

  it("(c) connects in full when the checkpoint differs (an earlier line of the scene changed)", async () => {
    const p = await player(SOURCE, SECOND);
    await p.edit("The first line.", "The first line, edited.");
    expectFull(after(p), "checkpoint");
  }, 120_000);

  it("(c) connects in full when a beat the route passes before the cursor's changed: its statement has a new id", async () => {
    const p = await player(SOURCE, SECOND);
    // The first line's beat runs on the route to the second line's.
    await p.edit("The first line.", "The first line, changed.");
    expectFull(after(p), "checkpoint");
  }, 120_000);

  it("(c) stays beat-only when a beat the route never passes changed, in a branch it does not take", async () => {
    const { a, full } = await twins(UNTAKEN, SAID, async (p) => {
      await p.edit("Never said.", "Never, ever said.");
      return after(p);
    });
    expectBeatOnly(a);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("(c) connects in full when the beat's own statement writes the story's state, which its checkpoint holds", async () => {
    const { a, full } = await twins(BADGED, SETS_MODE, async (p) => {
      const start = { badge: badge(p), ...after(p) };
      await p.edit("set_mode(true)", "set_mode(false)");
      return { start, edited: { badge: badge(p), ...after(p) } };
    });
    expect(a.start.badge).toBe("true");
    // The statement may call a function; the watch sees what it wrote.
    expectFull(a.edited, "checkpoint");
    expect(a.edited.targetWrote).toBe(true);
    expect(a.edited.badge).toBe("false");
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("(c) connects in full when the beat's own statement changes a stored table in place (rawset)", async () => {
    const { a, full } = await twins(RAWSET, lineIn(RAWSET, "Spoken."), async (p) => {
      const start = { badge: badge(p), ...after(p) };
      await p.edit("set_mode(true)", "set_mode(false)");
      return { start, edited: { badge: badge(p), ...after(p) } };
    });
    expect(a.start.badge).toBe("true");
    // The statement may call a function; the watch sees what it wrote.
    expectFull(a.edited, "checkpoint");
    expect(a.edited.targetWrote).toBe(true);
    expect(a.edited.badge).toBe("false");
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("(c) connects in full when the beat's own statement calls a function more times than before, which counts other visits", async () => {
    const { a, full } = await twins(VISITED, lineIn(VISITED, "Spoken."), async (p) => {
      const start = { badge: badge(p), ...after(p) };
      await p.edit("{f()}Spoken.", "{f()}{f()}Spoken.");
      return { start, edited: { badge: badge(p), ...after(p) } };
    });
    expect(a.start.badge).toBe("1");
    // The call writes nothing; the two replays counted other visits.
    expectFull(a.edited, "checkpoint");
    expect(a.edited.targetWrote).toBe(false);
    expect(a.edited.badge).toBe("2");
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("(h) connects in full when the page was sent a change after the display went up (a click updated a binding)", async () => {
    const { a, full } = await twins(BADGED_BEFORE, SPEAKS, async (p) => {
      const start = { badge: badge(p), ...after(p) };
      const button = [...p.h.overlay.querySelectorAll<HTMLElement>("*")].find(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() === "Unset",
      );
      const win = p.h.overlay.ownerDocument.defaultView as any;
      button?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      await settle(40);
      const clicked = { badge: badge(p), ...after(p) };
      // The beat's line changes, and the route to it does not.
      await p.edit("Spoken.", "Edited.");
      return { start, clicked, edited: { badge: badge(p), ...after(p) } };
    });
    expect(a.start.badge).toBe("true");
    expect(a.clicked.badge).toBe("false");
    expectFull(a.edited, "screen");
    // The replay set the badge's variable again, and the display sends the
    // badge as a full display does. (The page keeps what the click wrote,
    // after either: a reused node's create signature is not cleared by a
    // later update.)
    const badgeText = (step: { sent: any[] }) =>
      ops(step.sent)
        .filter((m) => m?.method === "ui/create" && /badge-0-text-0-span-0$/.test(m.params.element))
        .map((m) => m.params.content);
    expect(badgeText(a.edited)).toEqual([{ text: "true" }]);
    expect(badgeText(a.edited)).toEqual(badgeText(full.edited));
    expect(a.edited.badge).toBe(full.edited.badge);
    expect(a.edited.frame).toEqual(full.edited.frame);
  }, 120_000);

  it("(h) connects in full when the page sent an event since the display went up, though nothing was sent back", async () => {
    const p = await player(TYPED, TYPES);
    after(p);
    const input = p.h.overlay.querySelector<HTMLInputElement>("input");
    expect(input).toBeTruthy();
    const win = p.h.overlay.ownerDocument.defaultView as any;
    input!.value = "Link";
    input!.dispatchEvent(new win.Event("input", { bubbles: true }));
    await settle(40);
    expect(after(p).sent).toEqual([]);
    await p.edit("Spoken.", "Edited.");
    expectFull(after(p), "screen");
  }, 120_000);

  it.each([
    { what: "a user function", call: 'shout("Hey. ")' },
    { what: "a builtin", call: 'string.upper("hey. ")' },
  ])("(calls) stays beat-only when the beat's statement calls $what, which runs again from the checkpoint as on a full display", async ({ call }) => {
    const text = CALLING(call, '"steady"');
    const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
      await p.edit("Spoken.", "Edited.");
      return after(p);
    });
    expectBeatOnly(a);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it.each([
    { what: "a user function", bound: 'shout("steady")' },
    { what: "a builtin", bound: 'string.upper("steady")' },
  ])("(calls) connects in full when a binding of the tree calls $what", async ({ bound }) => {
    const text = CALLING("", bound);
    const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
      await p.edit("Spoken.", "Edited.");
      return after(p);
    });
    expectFull(a, "calls");
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("stays beat-only for a portrait changed in a dialogue whose text interpolates a user function", async () => {
    const text = `define HAPPY as image with
  src = "https://example.com/happy.png"
end

define SAD as image with
  src = "https://example.com/sad.png"
end

function shout(s)
  return s
end

-> start

scene start
  Before.
  HERO:
    [[show portrait HAPPY]]
    {shout("Hey.")} The line.
end
`;
    const { a, full } = await twins(text, lineIn(text, "The line."), async (p) => {
      await p.edit("portrait HAPPY]]", "portrait SAD]]");
      return after(p);
    });
    expectBeatOnly(a);
    expect(shows(a.frame, "sad.png")).toBe(true);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("(calls) stays beat-only when the beat's statement and the tree's bindings read variables and write text", async () => {
    const text = CALLING("", "stamp").replace("function shout(s)", "store stamp = 7\n\nfunction shout(s)");
    const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
      await p.edit("Spoken.", "Edited, at {stamp}.");
      return after(p);
    });
    expectBeatOnly(a);
    expect(shows(a.frame, "7")).toBe(true);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it.each([
    { what: "reads the host's clock", value: "os.time()" },
    { what: "draws a random number", value: "math.random(1, 1000000)" },
  ])("(c) connects in full when a statement the route replays before the beat $what", async ({ value }) => {
    const text = STAMPED(value);
    const clock = vi.useFakeTimers({ toFake: ["Date"], now: 1_700_000_000_000 });
    try {
      const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
        const start = after(p);
        // A second later, the beat's line is edited.
        clock.setSystemTime(1_700_000_001_000);
        await p.edit("Spoken.", "Edited.");
        return { start, edited: after(p) };
      });
      expectFull(a.edited, "checkpoint");
      expect(a.edited.frame).toEqual(full.edited.frame);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);

  it("(c) connects in full when the cursor moves to another beat", async () => {
    const p = await player(SOURCE, SECOND);
    await p.h.select(lineIn(SOURCE, "The third line."));
    await settle(40);
    expectFull(after(p), "checkpoint");
  }, 120_000);

  it("(d) connects in full when the declarations ran again", async () => {
    const p = await player(SOURCE, SECOND);
    const before = p.game.declarationsRun;
    // A declaration below the scenes: the compile runs the declarations
    // again, and no line before the beat changed.
    await p.edit("store late = 1", "store late = 2");
    expect(p.game.declarationsRun).toBeGreaterThan(before);
    expectFull(after(p), "declarations");
  }, 120_000);

  it("(e) connects in full when a suggestion no longer implies a picture the layout shows, though the context's base stands (f)", async () => {
    const { a, full } = await twins(IMPLIED, IMPLIES, async (p) => {
      const base = (p.game.program.contextRevision ?? "").split(":").slice(0, -1).join(":");
      const shown = JSON.stringify(p.game.module.ui.getImageSrcsByName("HAPPY~sad"));
      // The directive no longer implies the picture the badge shows.
      await p.edit("HAPPY:sad", "HAPPY:glad");
      return {
        sameBase: base === (p.game.program.contextRevision ?? "").split(":").slice(0, -1).join(":"),
        resolvesAsBefore: shown === JSON.stringify(p.game.module.ui.getImageSrcsByName("HAPPY~sad")),
        ...after(p),
      };
    });
    // (f) holds, and what the tree resolved does not.
    expect(a.sameBase).toBe(true);
    expect(a.resolvesAsBefore).toBe(false);
    expectFull(a, "layouts");
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("(f) connects in full when the context's base changed (a file was added)", async () => {
    const p = await player(SOURCE, SECOND);
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
    await p.edit("The second line.", "The second line, edited.");
    const step = after(p);
    expect(step.path).toMatchObject({ beatOnly: false });
    expect(["context", "checkpoint"]).toContain((step.path as any).refused);
  }, 120_000);

  it("(g) connects in full when another flow changed", async () => {
    const p = await player(SOURCE, SECOND);
    await p.edit("Another scene's line.", "Another scene's edited line.");
    expectFull(after(p), "flows");
  }, 120_000);

  it("(g) connects in full when the scene map changed (another beat shows another picture)", async () => {
    const p = await player(SOURCE, SECOND);
    await p.edit("portrait SAD]]", "portrait HAPPY]]");
    expectFull(after(p), "scenes");
  }, 120_000);

  it("(h) connects in full after a beat that opened a layout", async () => {
    const p = await player(OPENS, OPENED);
    await p.edit("Opened.", "Opened again.");
    expectFull(after(p), "screen");
  }, 120_000);

  it("(i) connects in full over a tree whose building wrote the story's state", async () => {
    const p = await player(COUNTED, lineIn(COUNTED, "First. > Second."));
    await p.edit("Second.", "Third.");
    const refused = after(p);
    expectFull(refused, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(refused.treePure).toBe(false);
  }, 120_000);

  it("(i) connects in full over a tree whose building changed a stored table in place (rawset)", async () => {
    const { a, full } = await twins(RAWSET_BUILD, lineIn(RAWSET_BUILD, "Spoken."), async (p) => {
      await p.edit("Spoken.", "Edited.");
      return after(p);
    });
    expectFull(a, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(a.treePure).toBe(false);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("(i) connects in full over a tree whose building called a function, which counts a visit", async () => {
    // A binding calls the function, and the beat's statement does not.
    const text = VISITED.replace("HERO: {f()}Spoken.", "HERO: Spoken.").replace(
      'text "{count.visits(-> f)}"',
      'text "{f()}{count.visits(-> f)}"',
    );
    const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
      await p.edit("Spoken.", "Edited.");
      return after(p);
    });
    expectFull(a, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(a.treePure).toBe(false);
    expect(a.frame).toEqual(full.frame);
  }, 120_000);

  it("(i) connects in full over a tree whose building showed an object's identity", async () => {
    const text = READS("tostring({})");
    const p = await player(text, lineIn(text, "Spoken."));
    const start = badge(p);
    after(p);
    await p.edit("Spoken.", "Edited.");
    const refused = after(p);
    expectFull(refused, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(refused.treePure).toBe(false);
    // Evaluated again, as a full display evaluates it.
    expect(start).toMatch(/^table: 0x/);
    expect(badge(p)).toMatch(/^table: 0x/);
    expect(badge(p)).not.toBe(start);
  }, 120_000);

  it("(i) connects in full over a tree whose building added an error", async () => {
    const text = READS('error("unbound")');
    const p = await player(text, lineIn(text, "Spoken."));
    after(p);
    await p.edit("Spoken.", "Edited.");
    const refused = after(p);
    expectFull(refused, "calls");
    // The watch behind the gate finds the tree impure too.
    expect(refused.treePure).toBe(false);
  }, 120_000);

  it("(i) connects in full over a tree whose building drew a random number", async () => {
    const text = READS("math.random(1, 1000000)");
    // Each story seeds its draws from the time it starts: both twins start
    // at the same time.
    vi.useFakeTimers({ toFake: ["Date"], now: 1_700_000_000_000 });
    try {
      const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
        await p.edit("Spoken.", "Edited.");
        return after(p);
      });
      expectFull(a, "calls");
      // The watch behind the gate finds the tree impure too.
      expect(a.treePure).toBe(false);
      expect(a.frame).toEqual(full.frame);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);

  it("(i) connects in full over a tree whose building read the host's clock, and shows the time a full display shows", async () => {
    const text = READS("os.time()");
    const clock = vi.spyOn(Date, "now");
    try {
      const { a, full } = await twins(text, lineIn(text, "Spoken."), async (p) => {
        clock.mockReturnValue(1_700_000_000_000);
        await p.edit("Spoken.", "Said.");
        const start = after(p);
        // A second later, the line is edited again.
        clock.mockReturnValue(1_700_000_001_000);
        await p.edit("Said.", "Edited.");
        return { start, edited: after(p) };
      });
      expect(shows(a.start.frame, "1700000000")).toBe(true);
      expectFull(a.edited, "calls");
      // The watch behind the gate finds the tree impure too.
      expect(a.edited.treePure).toBe(false);
      expect(shows(a.edited.frame, "1700000001")).toBe(true);
      expect(a.edited.frame).toEqual(full.edited.frame);
    } finally {
      clock.mockRestore();
    }
  }, 120_000);
});
