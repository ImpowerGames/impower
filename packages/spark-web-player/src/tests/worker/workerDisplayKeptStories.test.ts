import { describe, expect, it } from "vitest";
import { programIdentity } from "../../utils/programIdentity";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const TEXT = [
  "",
  "",
  "function greeting()",
  `  return "the real greeting"`,
  "end",
  "",
  "scene bridge",
  "  The bridge says {greeting()}.",
  "  The bridge says it again, {greeting()}.",
  "end",
  "scene start",
  "  -> bridge",
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
      files: [{ uri: MAIN_URI, text: TEXT }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      const real = h.controller._program;
      await h.select(FIRST);
      expect(shown(h.overlay).join(" ")).toContain("The bridge says the real greeting.");

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
