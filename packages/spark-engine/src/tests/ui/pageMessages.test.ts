// What the page needs from the game arrives in the game's messages, so the
// page never reads the game itself: which stream a message belongs to, where
// a reconcile pass opens and closes, the mixer a player plays through, and
// every src an image layer paints. And every message survives the structured
// clone that carries it to another thread.

import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, test } from "vitest";
import { cloneMessage } from "../harness/cloneMessage";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define beep as audio with
  src = "https://example.com/beep.wav"
end

define SPRITE as image with
  src = "https://example.com/hero.png"
end

define SHADOW as image with
  src = "https://example.com/shadow.png"
end

layout main with
  stage:
    portrait:
      image
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function runBeat(body: string, instant: boolean) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, instant);
  await flushMicrotasks(10);
  return harness;
}

describe("page messages", () => {
  test("every connect starts a stream that opens a reconcile pass, and the sweep closes it", async () => {
    const harness = createHarness(story("  Hi."));
    await harness.ready;
    const first = [...harness.messages];
    expect(first.length).toBeGreaterThan(0);
    expect(new Set(first.map((m) => m.epoch))).toEqual(new Set([1]));
    // The pass opens ahead of every element the connect re-emits.
    const ui = first.filter((m) => m.method.startsWith("ui/"));
    expect(ui[0].method).toBe("ui/reconcile-begin");

    harness.reset();
    await harness.reconnect();
    await flushMicrotasks(10);
    harness.game.module.ui.sweepReconcile();
    const second = [...harness.messages];
    expect(new Set(second.map((m) => m.epoch))).toEqual(new Set([2]));
    expect(second.filter((m) => m.method.startsWith("ui/"))[0].method).toBe(
      "ui/reconcile-begin",
    );
    expect(second.at(-1).method).toBe("ui/reconcile-sweep");
  });

  test("a connect that a newer one superseded while it waited sends nothing more", async () => {
    // The main layout's font keeps the first connect waiting; the page
    // connects again meanwhile, and that connect finishes before the first
    // one's font arrives. Whatever the first connect would
    // send then would be stamped with the newer stream's epoch and taken as
    // part of it, so it must send nothing.
    const fonts: File[] = [
      {
        uri: "file://proj/fancy.ttf",
        type: "font",
        name: "Fancy",
        ext: "ttf",
        src: "/file:/proj/fancy.ttf?v=1",
      } as File,
    ];
    const harness = createHarness(
      `style main with\n  font_family = "Fancy"\nend\n\n${story("  Hi.")}`,
      0,
      { assets: fonts, holdAssets: true },
    );
    await flushMicrotasks(20);
    const fontLoads = () =>
      harness.messages.filter((m) => m.method === "assets/load");
    expect(fontLoads()).toHaveLength(1);
    const first = harness.ready;
    // The newer connect gets its font at once and finishes.
    const second = harness.reconnect();
    await flushMicrotasks(20);
    const [olderLoad, newerLoad] = fontLoads();
    const answer = (load: any) =>
      harness.game.connection.receive({
        jsonrpc: "2.0",
        id: load.id,
        method: load.method,
        result: { loaded: [], failed: [], pinned: [] },
      } as any);
    answer(newerLoad);
    await second;
    await flushMicrotasks(20);
    // The newer connect built its screen and cleared its transient targets.
    const newer = flattenMessages(
      harness.messages.filter((m) => m.epoch === 2),
    ).map((m) => m.method);
    expect(newer).toContain("ui/create");
    expect(newer).toContain("ui/write-text");
    // Then the older connect's font arrives.
    const mark = harness.messages.length;
    answer(olderLoad);
    await first;
    await flushMicrotasks(20);
    // Anything it sent now (rebuilding the screen over the newer one's,
    // clearing targets the newer stream may have written since) would carry
    // the newer stream's epoch.
    expect(harness.messages.slice(mark).map((m) => m.method)).toEqual([]);
  });

  test("a restore superseded while a re-opened layout's font loads does not mount it", async () => {
    // The checkpoint had `hud` open; restoring it waits for its font, and a
    // newer connect begins meanwhile. That connect restores its own layouts.
    const fonts: File[] = [
      {
        uri: "file://proj/fancy.ttf",
        type: "font",
        name: "Fancy",
        ext: "ttf",
        src: "/file:/proj/fancy.ttf?v=1",
      } as File,
    ];
    const source = `style hud with\n  font_family = "Fancy"\nend\n\nlayout hud with\n  stats:\n    text\nend\n\n${story("  Hi.")}`;
    const restoreHud = async (supersede: boolean) => {
      const harness = createHarness(source, 0, {
        assets: fonts,
        holdAssets: true,
        autoOpenAll: false,
      });
      await harness.ready;
      const ui: any = harness.game.module.ui;
      expect(ui._mountedLayouts.has("hud")).toBe(false);
      ui._state.layout = [{ name: "hud" }];
      const restoring = ui.onRestore();
      await flushMicrotasks(20);
      expect(harness.heldAssetLoadCount()).toBe(1);
      if (supersede) {
        harness.game.connection.beginEpoch();
      }
      const mark = harness.messages.length;
      harness.releaseAssets();
      await restoring;
      await flushMicrotasks(20);
      return flattenMessages(harness.messages.slice(mark))
        .filter((m) => m.method === "ui/create")
        .map((m) => m.params.name);
    };
    // Unsuperseded, the restore mounts `hud` once its font is in.
    expect(await restoreHud(false)).toContain("hud");
    expect(await restoreHud(true)).toEqual([]);
  });

  test("an audio restore superseded while its loop loads does not start it", async () => {
    const restoreLoop = async (supersede: boolean) => {
      const harness = createHarness(story("  Hi."), 0, {
        beforeConnect: (game) => {
          game.context.system.previewing = undefined;
        },
      });
      await harness.ready;
      const connection = harness.game.connection;
      // The page holds this restore's load until the newer connect began.
      const sent: any[] = [];
      connection.connectOutput((message) => sent.push(cloneMessage(message)));
      const audio: any = harness.game.module.audio;
      audio._state.channels = {
        music: { looping: [{ key: "audio.beep", to: 1 }] },
      };
      const restoring = audio.onRestore();
      await flushMicrotasks(20);
      const load = sent.find((m) => m.method === "audio/load");
      expect(load?.params.key).toContain("beep");
      if (supersede) {
        connection.beginEpoch();
      }
      const mark = sent.length;
      connection.receive({
        jsonrpc: "2.0",
        id: load.id,
        method: load.method,
        result: { outputLatency: 0 },
      } as any);
      await restoring;
      await flushMicrotasks(20);
      return sent.slice(mark).map((m) => m.method);
    };
    // Unsuperseded, the restore resumes the loop once it has loaded.
    expect(await restoreLoop(false)).toContain("audio/update");
    expect(await restoreLoop(true)).toEqual([]);
  });

  test("audio/load names the mixer its channel plays through and the gain it starts at", async () => {
    const harness = await runBeat(`  ((play sound beep))\n  HERO: Hello.`, false);
    const loads = flattenMessages(harness.messages).filter(
      (m) => m.method === "audio/load",
    );
    expect(loads.map((m) => m.params.channel).sort()).toEqual([
      "sound",
      "typewriter",
    ]);
    // What the page used to look up in the game's context for itself.
    const context: any = harness.game.context;
    for (const load of loads) {
      const channel = load.params.channel;
      const named = context.channel?.[channel]?.mixer;
      const mixer =
        (typeof named === "string" ? named : named?.$name) || channel;
      expect(load.params.mixer).toBe(mixer);
      expect(load.params.mixerGain).toBe(context.mixer?.[mixer]?.gain ?? 1);
      expect(typeof load.params.mixerGain).toBe("number");
    }
  });

  test("ui/write-image carries every src a layered image paints", async () => {
    const harness = await runBeat(`  [[show portrait SPRITE+SHADOW]]`, true);
    const writes = flattenMessages(harness.messages).filter(
      (m) => m.method === "ui/write-image" && m.params.target === "portrait",
    );
    const contents = writes.flatMap((m) =>
      m.params.instructions.map((i: any) => i.content).filter(Boolean),
    );
    expect(contents).toHaveLength(1);
    expect(contents[0].imageNames).toBe("SPRITE SHADOW");
    expect(contents[0].srcs).toEqual([
      "https://example.com/hero.png",
      "https://example.com/shadow.png",
    ]);
  });
});

describe("cloneMessage", () => {
  test("delivers a plain message unchanged", () => {
    const message = {
      jsonrpc: "2.0",
      method: "ui/write-text",
      id: "1",
      params: { target: "dialogue", instructions: [{ text: "Hi" }], none: undefined },
      epoch: 3,
    };
    expect(cloneMessage(message)).toStrictEqual(message);
  });

  test("refuses a message carrying a function", () => {
    expect(() =>
      cloneMessage({ method: "ui/animate", params: { onDone: () => {} } }),
    ).toThrow(/`ui\/animate` cannot cross a thread/);
  });

  test("refuses a message whose class instance would arrive as a plain object", () => {
    class Keyframes {
      opacity = 1;
    }
    expect(() =>
      cloneMessage({ method: "ui/animate", params: { frames: [new Keyframes()] } }),
    ).toThrow(/params\.frames\.0: sent a Keyframes, received a plain copy/);
  });
});
