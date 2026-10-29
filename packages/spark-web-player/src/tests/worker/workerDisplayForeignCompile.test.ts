// Opening a script compiles it, and a script the story does not include
// compiles on its own. On a cold start in VS Code every script is open, so
// those compiles reach the worker while it displays the story's first beat. A
// compile gave the worker's game its program, which took the display under way
// over: the display answered that it showed nothing, and nothing asked for the
// beat again, so the preview stayed black for good (#1874).
import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { UpdateCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerDocumentMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

// Outside the story's project folder, so the story does not include it
// (#1387): every script under main's folder is part of the story.
const LOOSE_URI = "file:///other/loose.sd";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end



scene start
  HERO:
    The beat with nothing to wait for.

  HERO:
    [[SPRITE_A]]
    The beat that waits for its picture.
end
`;

const LOOSE = `

scene start
  A script the story does not include.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The beat with nothing to wait for.");
const WAITING = lineOf("The beat that waits for its picture.");

describe("a compile of a script the story does not include", () => {
  it("does not take over the story's display while it waits for its picture", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: SOURCE },
        { uri: LOOSE_URI, text: LOOSE },
      ],
      startFrom: { file: MAIN_URI, line: FIRST },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat with nothing to wait for.");

      // The page asks for the beat that waits on a.png.
      const display = h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(h.controller._program)!,
        file: MAIN_URI,
        line: WAITING,
        speculative: false,
      });
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");

      // The other script opens and compiles on its own while it waits,
      // routed to the point the preview shows, as the workspace compiles
      // each script it opens.
      const loose = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: LOOSE_URI },
        startFrom: { file: MAIN_URI, line: WAITING },
      });
      expect(Object.keys(loose.program.scripts)).toEqual([LOOSE_URI]);
      releaseA();
      const result = await display;
      await settle(40);

      expect(result.displayed).toBe(true);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("is still kept for the page, which judges by its own preview point", async () => {
    // A selection the author did not make (a jump from the Problems panel,
    // say) moves the point the workspace compiles toward into the other
    // script, while the page's preview point stays in the story. The story's
    // next compile is then routed to a point it does not hold. The page
    // takes it, since it holds the page's point, and must be able to show it.
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: SOURCE },
        { uri: LOOSE_URI, text: LOOSE },
      ],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat with nothing to wait for.");

      const lines = SOURCE.split("\n");
      await h.edit([
        {
          range: {
            start: { line: FIRST, character: 0 },
            end: { line: FIRST, character: lines[FIRST]!.length },
          },
          text: "    The beat, edited.",
        },
      ]);
      const compiled = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: LOOSE_URI, line: 2 },
      });
      expect(compiled.program.scripts).not.toHaveProperty([LOOSE_URI]);
      await h.controller.loadProgram(compiled.program);
      await settle(40);

      expect(h.controller._program).toBe(compiled.program);
      expect(h.overlay.textContent).toContain("The beat, edited.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: FIRST });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("is shown when it is the first program and the page takes it", async () => {
    // The author's selection set the page's point in the story before any
    // program arrived; one they did not make then moved the point the
    // workspace compiles toward. No compile has given the worker's game a
    // program when the page asks for this one.
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: SOURCE },
        { uri: LOOSE_URI, text: LOOSE },
      ],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      h.controller._options = { startFrom: { file: MAIN_URI, line: FIRST } };
      const compiled = await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: LOOSE_URI, line: 2 },
      });
      await h.controller.loadProgram(compiled.program);
      await settle(40);

      expect(h.overlay.textContent).toContain("The beat with nothing to wait for.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("is let go, however many the page does not take", async () => {
    // Replacing a file recompiles the document compiled last, which after a
    // cold start can be a script the story does not include; each of those
    // programs is a new one, and the page takes none of them.
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: SOURCE },
        { uri: LOOSE_URI, text: LOOSE },
      ],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      const ids: string[] = [];
      for (let version = 2; version <= 7; version++) {
        await h.page.sendRequest(UpdateCompilerDocumentMessage.type, {
          textDocument: { uri: LOOSE_URI, version },
          contentChanges: [{ text: LOOSE.replace("include.", `include, take ${version}.`) }],
        } as any);
        const loose = await h.page.sendRequest(CompileProgramMessage.type, {
          textDocument: { uri: LOOSE_URI },
          startFrom: { file: MAIN_URI, line: FIRST },
        });
        await h.controller.loadProgram(loose.program);
        ids.push(programIdentity(loose.program)!);
      }
      await settle(40);

      expect(new Set(ids).size).toBe(6);
      const kept = h.workerState.player.keptPrograms();
      expect(ids.filter((id) => kept.includes(id))).toEqual(ids.slice(-2));
      // The page's preview is untouched.
      expect(h.overlay.textContent).toContain("The beat with nothing to wait for.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
