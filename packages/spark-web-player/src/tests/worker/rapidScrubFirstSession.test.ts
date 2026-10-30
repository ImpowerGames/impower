import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { createPlayerHarness, holdFirstInit, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first beat.

  HERO:
    The second beat.

  HERO:
    The third beat.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first beat.");
const SECOND = lineOf("The second beat.");
const THIRD = lineOf("The third beat.");

const mainLayouts = (overlay: HTMLElement) => {
  const ids = new Set<string>();
  for (const el of overlay.querySelectorAll('[id^="e-layouts-0-main-"]')) {
    ids.add(/^e-layouts-0-(main-\d+)/.exec(el.id)![1]!);
  }
  return [...ids];
};

const dialogue = (overlay: HTMLElement) =>
  [...overlay.querySelectorAll(".dialogue")].map((el) => el.getAttribute("text"));

describe("scrubbing while the first preview session is still coming up (#317)", () => {
  it("builds one application and shows the last scrub's beat in one main layout", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      const { apps, release } = holdFirstInit(h);

      const displayed: number[] = [];
      const request = h.link.request.bind(h.link);
      (h.link as any).request = (type: any, params: any) => {
        if (type.method === DisplayPreviewMessage.type.method) {
          displayed.push(params.line);
        }
        return request(type, params);
      };

      const painted = new Set<string | null>();
      const Observer = (h.overlay.ownerDocument.defaultView as any).MutationObserver;
      const observer = new Observer(() => {
        for (const text of dialogue(h.overlay)) painted.add(text);
      });
      observer.observe(h.overlay, { subtree: true, childList: true, attributes: true });

      const compiled = h.compile();
      await settle(40);
      expect(apps.length).toBe(1);

      const second = await h.selectWithoutWaiting(SECOND);
      const third = await h.selectWithoutWaiting(THIRD);
      await settle(20);
      expect(apps.length).toBe(1);

      release();
      await Promise.all([compiled, second.previewed, third.previewed]);
      await settle(60);
      observer.disconnect();

      expect(displayed).toEqual([THIRD]);
      expect([...painted].filter((text) => text !== "The third beat.")).toEqual([]);
      expect(painted.has("The third beat.")).toBe(true);
      expect(apps.length).toBe(1);
      expect(apps[0].destroys).toBe(0);
      expect(h.controller._app).toBe(apps[0]);
      expect(mainLayouts(h.overlay)).toEqual(["main-0"]);
      expect(dialogue(h.overlay)).toEqual(["The third beat."]);
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: THIRD });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
