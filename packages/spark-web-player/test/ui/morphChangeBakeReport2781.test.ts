import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource } from "@impower/sparkdown/src/morph/hosts";
import type { MorphArtifact, MorphRef } from "@impower/sparkdown/src/morph/types";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback } from "../../src/app/morph/MorphPlayback";
import { RuntimeDiagnosticsRun } from "../../src/utils/RuntimeDiagnosticsRun";
import { createDOMHarness, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const lips = (...ys: number[]) => ys.map((y) => `<path data-name="lip" d="M10,${y} C30,${y + 25} 70,${y + 25} 90,${y}Z" fill="#a33"/>`).join("");
const face = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<g data-name="mouth.smile default">${lips(40, 60)}</g>
<g data-name="mouth.frown">${lips(30, 50, 70)}</g>
</svg>`;

const FILES = [{ uri: "inmemory:///mia.svg", type: "image", name: "mia", ext: "svg", data: face }];

const SOURCE = `morph bend {
  method = match
  timing {
    trigger = change
    duration = 0.5
  }
}

scene start
  [[show portrait mia:mouth.smile]]
  Mia smiles.
  [[show portrait mia:mouth.frown]]
  Then she does not.
  [[show portrait mia:mouth.smile]]
  She smiles again.
  [[show portrait mia:mouth.frown]]
  And frowns again.
end
`;

const PAIRING = {
  code: "pairing-count",
  severity: "warning",
  message: '"lip" has 2 drawings in one pose and 3 in the other; neither is a single drawing, so they cannot pair and each uses its fallback.',
  morphs: ["bend"],
  layer: "lip",
};

async function until(check: () => boolean) {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
}

async function play(beats: number, instant: boolean) {
  const h = createDOMHarness(SOURCE, 0, { files: FILES });
  const playback = MorphPlayback.for(h.overlay);
  const inline = inlineMorphSource(() => h.game.program.context);
  playback.configure({
    host: createMorphHost({
      service: new MorphBakeService(),
      channel: () => h.game.program.morphs,
      readSource: async (ref, signal) => {
        const read = await inline(ref, signal);
        return read ? { text: read.text } : undefined;
      },
    }),
    seed: "test",
    requestFrame: () => 0,
    cancelFrame: () => {},
  });
  const run = new RuntimeDiagnosticsRun({ uri: "inmemory:///main.sd", scripts: {} }, null);
  const reported: string[] = [];
  playback.reportChangeBake = (ref, artifact) => {
    reported.push(ref.key);
    run.addChangeBake(ref, artifact);
  };
  await h.ready;
  h.jumpTo("start");
  for (let index = 0; index < beats; index++) {
    await h.display(h.nextBeat()!, instant);
    await flushMicrotasks(10);
    await until(() => instant || reported.length >= index);
    playback.advance(1);
  }
  return { run, reported };
}

describe("a played change pair's bake diagnostics (#2781)", () => {
  test("the player returns the bake's problem with the image and the look, from a source that names no file", async () => {
    const { run } = await play(2, false);
    await until(() => !!run.params().morphBakes);
    expect(run.params()).toMatchObject({ diagnostics: {} });
    expect(run.params().morphBakes).toEqual([{ image: "mia", source: expect.any(String), variant: "mia:mouth.frown", diagnostics: [PAIRING] }]);
  });

  test("the same pair played again replaces its entry", async () => {
    const { run, reported } = await play(4, false);
    await until(() => reported.length >= 3);
    expect(new Set(reported).size).toBe(2);
    expect(run.params().morphBakes).toEqual([
      { image: "mia", source: expect.any(String), variant: "mia:mouth.frown", diagnostics: [PAIRING] },
      { image: "mia", source: expect.any(String), variant: "mia:mouth.smile", diagnostics: [PAIRING] },
    ]);
  });

  test("beats shown at once play no change and return nothing", async () => {
    const { run, reported } = await play(2, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reported).toEqual([]);
    expect(run.params().morphBakes).toBeUndefined();
  });
});

describe("a change pair's report belongs to the bake it came from (#2781)", () => {
  const ref = (image: string): MorphRef => ({
    morphs: ["bend"],
    key: "same-art",
    image,
    selection: '{"mouth":"frown"}',
    groups: ["mouth"],
    recipes: { bend: "recipe" },
    source: "data:same",
  });
  const artifact = { diagnostics: [{ ...PAIRING, code: "pairing-count" as const, severity: "warning" as const }] } as unknown as MorphArtifact;

  test("two images with the same art keep one entry each", () => {
    const run = new RuntimeDiagnosticsRun({ uri: "inmemory:///main.sd", scripts: {} }, null);
    run.addChangeBake(ref("mia"), artifact);
    run.addChangeBake(ref("tom"), artifact);
    expect(run.params().morphBakes?.map((bake) => bake.image)).toEqual(["mia", "tom"]);
  });

  test("a bake still resolving when the next run begins reports to the run it started in, and a cancelled one reports nothing", async () => {
    const env = installJSDOM();
    try {
      const pending: ((handle: any) => void)[] = [];
      const playback = new MorphPlayback(env.overlay, {
        host: { resolve: () => new Promise((resolve) => pending.push(resolve)) },
        requestFrame: () => 0,
        cancelFrame: () => {},
      });
      const first: string[] = [];
      const second: string[] = [];
      playback.reportChangeBake = (r) => first.push(r.image);
      const started = playback.resolver.resolve(ref("mia"));
      const cancel = new AbortController();
      const cancelled = playback.resolver.resolve(ref("tom"), { signal: cancel.signal });
      playback.reportChangeBake = (r) => second.push(r.image);
      cancel.abort();
      for (const resolve of pending) resolve({ key: "same-art", artifact, release: () => {} });
      await Promise.all([started, cancelled]);
      expect(first).toEqual(["mia"]);
      expect(second).toEqual([]);
    } finally {
      env.restore();
    }
  });
});
