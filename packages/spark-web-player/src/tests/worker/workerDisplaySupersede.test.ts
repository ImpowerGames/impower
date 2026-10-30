import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, holdFirstInit, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end

define SPRITE_B as image with
  src = "https://example.com/b.png"
end



scene start
  HERO:
    [[SPRITE_A]]
    The beat that waits for its picture.

  HERO:
    [[SPRITE_B]]
    The beat that takes over.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const WAITING = lineOf("The beat that waits for its picture.");
const TAKING_OVER = lineOf("The beat that takes over.");

describe("a preview displayed from the worker's game", () => {
  it("never paints when a newer one takes over while it waits for its picture", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat that takes over.");

      const painted: string[] = [];
      const Observer = (h.overlay.ownerDocument.defaultView as any).MutationObserver;
      const observer = new Observer(() => painted.push(h.overlay.textContent ?? ""));
      observer.observe(h.overlay, { subtree: true, childList: true, characterData: true });

      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");

      await h.select(TAKING_OVER);
      releaseA();
      await waiting.previewed;
      await settle(40);
      observer.disconnect();

      expect(painted.some((text) => text.includes("The beat that waits for its picture."))).toBe(false);
      expect(h.overlay.textContent).toContain("The beat that takes over.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: TAKING_OVER });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("never paints when a compile takes over while it waits for its picture", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      const painted: string[] = [];
      const Observer = (h.overlay.ownerDocument.defaultView as any).MutationObserver;
      const observer = new Observer(() => painted.push(h.overlay.textContent ?? ""));
      observer.observe(h.overlay, { subtree: true, childList: true, characterData: true });

      const display = h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(h.controller._program)!,
        file: MAIN_URI,
        line: WAITING,
        speculative: false,
      });
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");

      const edited = SOURCE.replace("The beat that takes over.", "The beat, edited.");
      const lines = SOURCE.split("\n");
      await h.edit([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: lines.length - 1, character: lines.at(-1)!.length },
          },
          text: edited,
        },
      ]);
      await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
      });
      releaseA();
      const result = await display;
      await settle(40);
      observer.disconnect();

      expect(result.displayed).toBe(false);
      expect(painted.some((text) => text.includes("The beat that waits for its picture."))).toBe(false);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("paints the real document when a selection recompiles it unchanged while it waits", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      const lines = SOURCE.split("\n");
      await h.suggest(
        [
          {
            range: {
              start: { line: TAKING_OVER, character: 4 },
              end: { line: TAKING_OVER, character: lines[TAKING_OVER]!.length },
            },
            text: "A suggested line.",
          },
        ],
        TAKING_OVER,
      );
      const display = h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(h.controller._program)!,
        file: MAIN_URI,
        line: WAITING,
        speculative: false,
      });
      await settle(40);
      await h.page.sendRequest(SelectCompilerDocumentMessage.type, {
        textDocument: { uri: MAIN_URI },
        selectedRange: { start: { line: WAITING, character: 0 }, end: { line: WAITING, character: 0 } },
        docChanged: false,
        userEvent: true,
      });
      releaseA();
      const result = await display;
      await settle(40);

      expect(result.displayed).toBe(true);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("paints the waiting beat when an unchanged compile replays its route meanwhile", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat that takes over.");
      const display = h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(h.controller._program)!,
        file: MAIN_URI,
        line: WAITING,
        speculative: false,
      });
      await settle(40);
      await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: WAITING },
      });
      releaseA();
      const result = await display;
      await settle(40);

      expect(result.displayed).toBe(true);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("stops hearing the worker's game when the preview detaches and when the player goes", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
    });
    try {
      const listening = () => {
        let count = 0;
        for (const set of (h.link as any)._listeners.values()) count += set.size;
        return count;
      };
      await h.compile();
      expect(listening()).toBeGreaterThan(0);
      await h.controller.detachWorkerPreview();
      expect(listening()).toBe(0);
      await h.select(WAITING);
      expect(listening()).toBeGreaterThan(0);
      h.controller.dispose();
      expect(listening()).toBe(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  for (const ending of ["detach", "dispose"] as const) {
    it(`shows nothing once the preview is gone when its application finishes building after a ${ending}`, async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: TAKING_OVER },
      });
      try {
        let releaseBuild!: () => void;
        const buildHeld = new Promise<void>((resolve) => (releaseBuild = resolve));
        const buildWorkerApp = h.controller.buildWorkerApp.bind(h.controller);
        h.controller.buildWorkerApp = async (link: unknown) => {
          await buildHeld;
          return buildWorkerApp(link);
        };
        const compiled = h.compile();
        await settle(40);
        if (ending === "detach") {
          await h.controller.detachWorkerPreview();
        } else {
          h.controller.dispose();
        }
        const routed = h.toRouter.length;
        releaseBuild();
        await compiled;
        await settle(60);

        expect(h.toRouter.length).toBe(routed);
        expect(h.controller._app).toBeUndefined();
        expect((h.link as any)._sink).toBeUndefined();
      } finally {
        h.dispose();
      }
    }, 120_000);
  }

  it("shows nothing once the player goes while a display waits for its picture", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      h.controller.dispose();
      await settle(20);
      const routed = h.toRouter.length;
      releaseA();
      await waiting.previewed;
      await settle(60);

      expect(h.toRouter.length).toBe(routed);
      expect(h.controller._app).toBeUndefined();
      expect((h.link as any)._sink).toBeUndefined();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keeps the preview that follows a detach when the build before it finishes late", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
    });
    try {
      let releaseFirst!: () => void;
      const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
      const buildWorkerApp = h.controller.buildWorkerApp.bind(h.controller);
      let builds = 0;
      h.controller.buildWorkerApp = async (link: unknown) => {
        if (++builds === 1) {
          await firstHeld;
        }
        return buildWorkerApp(link);
      };
      const compiled = h.compile();
      await settle(40);
      await h.controller.detachWorkerPreview();
      const next = await h.selectWithoutWaiting(WAITING);
      await settle(20);
      releaseFirst();
      await compiled;
      await next.previewed;
      await settle(60);

      expect(builds).toBe(2);
      expect(h.controller._app).toBeDefined();
      expect((h.link as any)._sink).toBeDefined();
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: WAITING });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("settles the preview once the player goes while its application initializes", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
    });
    try {
      const { apps, release } = holdFirstInit(h);
      const compiled = h.compile();
      await settle(40);
      expect(apps.length).toBe(1);
      h.controller.dispose();
      h.controller.dispose();
      release();
      await compiled;
      await settle(60);

      expect(apps.map((app) => app.destroys)).toEqual([1]);
      expect(h.controller._app).toBeUndefined();
      expect((h.link as any)._sink).toBeUndefined();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keeps PLAY's application when the preview build before it finishes late", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
    });
    try {
      const { apps, release } = holdFirstInit(h);
      const compiled = h.compile();
      await settle(40);
      expect(apps.length).toBe(1);
      const detached = h.controller.detachWorkerPreview();
      const played = h.controller.startGameAndApp();
      await settle(40);
      release();
      await Promise.all([compiled, detached]);
      expect(await played).toBe(true);
      await settle(60);

      expect(apps.length).toBe(2);
      expect(apps.map((app) => app.destroys)).toEqual([1, 0]);
      expect(h.controller._app).toBe(apps[1]);
      expect(h.playing()?.state).toBe("running");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("connects the application a detach built when an older display answers late", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
    });
    try {
      await h.compile();

      const game = h.workerState.gameState.game!;
      const connect = game.connect.bind(game);
      let connects = 0;
      game.connect = (send: any) => {
        connects += 1;
        return connect(send);
      };

      let deliver!: () => void;
      const held = new Promise<void>((resolve) => (deliver = resolve));
      const request = h.link.request.bind(h.link);
      let heldOnce = false;
      (h.link as any).request = async (type: any, params: any) => {
        const answer = await request(type, params);
        if (type.method === DisplayPreviewMessage.type.method && !heldOnce) {
          heldOnce = true;
          await held;
        }
        return answer;
      };
      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);

      await h.controller.detachWorkerPreview();
      const replaced = await h.selectWithoutWaiting(WAITING);
      const before = connects;
      deliver();
      await Promise.all([waiting.previewed, replaced.previewed]);
      await settle(60);

      expect(connects).toBeGreaterThan(before);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("paints once its picture arrives when nothing takes over", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");
      releaseA();
      await waiting.previewed;
      await settle(40);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: WAITING });
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("a preview the same point repeats while it waits for its picture (#1820)", () => {
  it("ends the held display once the picture arrives, with no time limit", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat that takes over.");

      const first = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      const repeat = await h.selectWithoutWaiting(lineOf("[[SPRITE_A]]"));
      await settle(40);
      expect(h.overlay.textContent).toContain("The beat that takes over.");

      releaseA();
      await first.previewed;
      await repeat.previewed;
      await settle(40);

      expect((h.overlay as any).__sdBeat).toBeUndefined();
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
      expect(h.overlay.textContent).not.toContain("The beat that takes over.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
