// The worker displays the real document, and a suggestion it kept, from the
// story compiled for each (#680), after later compiles have carried that
// story's unchanged flows into their own. A display the worker has to route
// afresh runs the kept story, so it has to run as that story: a call from an
// unchanged scene reaches the function of the program being displayed, not
// the one of the compile that came after it.
import { describe, expect, it } from "vitest";
import { programIdentity } from "../../utils/programIdentity";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const TEXT = [
  "-> bridge",
  "",
  "function greeting()",
  `  return "the real greeting"`,
  "end",
  "",
  "scene bridge",
  "  The bridge says {greeting()}.",
  "  The bridge says it again, {greeting()}.",
  "end",
  "",
].join("\n");

const lineOf = (find: string) => TEXT.split("\n").findIndex((l) => l.includes(find));
const FIRST = lineOf("The bridge says {greeting()}.");
const AGAIN = lineOf("The bridge says it again");
const GREETING = lineOf("the real greeting");

const shown = (overlay: HTMLElement) =>
  (overlay.textContent ?? "").match(/The bridge says[a-z ,]*greeting\./g) ?? [];

describe("a program the worker kept", () => {
  it("is displayed from its own story when the display has to route it again", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      const real = h.controller._program;
      await h.select(FIRST);
      expect(shown(h.overlay).join(" ")).toContain("The bridge says the real greeting.");

      // A suggestion changes the function; the scene that calls it is carried
      // over into the suggestion's story unchanged.
      const at = TEXT.split("\n")[GREETING]!.indexOf("the real greeting");
      await h.suggest(
        [
          {
            range: {
              start: { line: GREETING, character: at },
              end: { line: GREETING, character: at + "the real greeting".length },
            },
            text: "the suggested greeting",
          },
        ],
        FIRST,
      );
      expect(shown(h.overlay).join(" ")).toContain("The bridge says the suggested greeting.");

      // The real program at a line its route has not reached yet: the worker
      // routes it afresh, in the story it kept for it.
      const { displayed } = await h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(real)!,
        file: MAIN_URI,
        line: AGAIN,
        speculative: false,
      });
      await settle(40);
      expect(displayed).toBe(true);
      expect(shown(h.overlay).join(" ")).toContain("The bridge says it again, the real greeting.");
      expect(shown(h.overlay).join(" ")).not.toContain("suggested");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
