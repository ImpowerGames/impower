import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { UpdateCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerDocumentMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const LOOSE_URI = "file:///other/loose.sd";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end

-> start

scene start
  HERO:
    The beat with nothing to wait for.

  HERO:
    [[SPRITE_A]]
    The beat that waits for its picture.
end
`;

const LOOSE = `-> loose

scene loose
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

      const display = h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(h.controller._program)!,
        file: MAIN_URI,
        line: WAITING,
        speculative: false,
      });
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");

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
      expect(h.overlay.textContent).toContain("The beat with nothing to wait for.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
