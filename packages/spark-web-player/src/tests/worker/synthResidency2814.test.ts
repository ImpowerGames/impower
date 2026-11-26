// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AudioModule } from "@impower/spark-engine/src/game/modules/audio/classes/AudioModule";
import { SynthBuffer } from "@impower/spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { AudioReleasedMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/AudioReleasedMessage";
import { applyBuiltinDefaults } from "@impower/spark-engine/src/game/core/utils/applyBuiltinDefaults";
import { preludeContext } from "@impower/spark-engine/src/tests/harness/compilePrelude";
import { AudioClock } from "../../app/AudioClock";
import AudioManager from "../../app/managers/AudioManager";
import { createStandInAudio } from "./standInAudio";

class WorkerAudio extends AudioModule {
  async play(events: any[]) {
    const { audioToLoad, updates } = this.plan("music", events);
    await this.loadAllAudio([...audioToLoad]);
    return updates;
  }
}

function workerFor(page: AudioManager, loads: any[], connection = { epoch: 0 }) {
  const context: any = { system: {}, config: {}, synth: { ...preludeContext()["synth"] } };
  applyBuiltinDefaults(context);
  return new WorkerAudio({
    context,
    connection: Object.assign(connection, {
      async emit(message: any, transfer?: ArrayBuffer[]) {
        const copy = structuredClone(message, transfer?.length ? { transfer } : undefined);
        if (copy.method === "audio/load") loads.push(copy.params);
        return (await page.onReceiveRequest(copy))?.result;
      },
    }),
  } as any);
}

const KEY = "synth.character~d2";

describe("synthesised sounds the page already holds (#2814)", () => {
  it("does not synthesise again for a fade of a sound the page holds", async () => {
    const loads: any[] = [];
    const audio = createStandInAudio({ synthesises: true });
    let worker!: WorkerAudio;
    const app: any = { previewing: false, emit: (m: any) => worker.onReceiveNotification(m) };
    const page = audio.attach(app, app.emit);
    worker = workerFor(page, loads);
    await page.onInit();

    const start = await worker.play([{ control: "start", assets: [KEY], loop: true }]);
    await page.updateAudioPlayers({ channel: "music", updates: start });
    const fade = await worker.play([{ control: "fade", assets: [KEY], to: 0.5 }]);
    await page.updateAudioPlayers({ channel: "music", updates: fade });

    expect(loads.map((p) => p.samples?.length ?? 0)).toEqual([96000, 0]);
    expect(audio.buffers).toHaveLength(1);
    expect(page.playingKeys()).toEqual([KEY]);
  });

  it("synthesises again once the page releases the sound, or once the connection starts a new epoch", async () => {
    const loads: any[] = [];
    const audio = createStandInAudio({ synthesises: true });
    let worker!: WorkerAudio;
    const app: any = { previewing: false, emit: (m: any) => worker.onReceiveNotification(m) };
    const page = audio.attach(app, app.emit);
    const connection = { epoch: 0 };
    worker = workerFor(page, loads, connection);
    await page.onInit();

    await worker.play([{ control: "start", assets: [KEY] }]);
    worker.onReceiveNotification(
      AudioReleasedMessage.type.notification({ channel: "music", key: KEY }),
    );
    await worker.play([{ control: "start", assets: [KEY] }]);
    connection.epoch = 1;
    await worker.play([{ control: "start", assets: [KEY] }]);

    expect(loads.map((p) => p.samples?.length ?? 0)).toEqual([96000, 96000, 96000]);
  });

  it("tells the game when it prunes a synthesised sound that finished", async () => {
    const sent: any[] = [];
    const audio = createStandInAudio({ synthesises: true });
    const page = audio.attach({ previewing: false, emit: (m: any) => sent.push(m) }, () => {});
    const player = { playing: false, instances: [{ ended: Promise.resolve() }], dispose() {} };
    (page as any).getAudioChannel("music").set(KEY, player);
    (page as any)._synthKeys.add(KEY);

    (page as any).pruneWhenDone("music", KEY, player);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent.filter((m) => m.method === "audio/released").map((m) => m.params)).toEqual([
      { channel: "music", key: KEY },
    ]);
  });

  it("reports a suspended context's rate, so the worker synthesises before audio is unlocked", async () => {
    const loads: any[] = [];
    const notifications: any[] = [];
    const wrapped: { rate: number; samples: Float32Array }[] = [];
    const suspended = {
      state: "suspended" as AudioContextState,
      currentTime: 0,
      sampleRate: 44100,
      createBuffer(_channels: number, length: number, rate: number) {
        const buffer = {
          length,
          duration: length / rate,
          copyToChannel(samples: Float32Array) {
            wrapped.push({ rate, samples: Float32Array.from(samples) });
          },
        };
        return buffer;
      },
    };
    const audioClock = new AudioClock(0, () => 0);
    audioClock.setContext(suspended);
    let worker!: WorkerAudio;
    const page = new AudioManager({
      previewing: true,
      audioContext: undefined,
      audioClock,
      emit: (m: any) => {
        notifications.push(m);
        worker.onReceiveNotification(m);
      },
    } as any);
    (page as any)._unsafeAudioContext = suspended;
    worker = workerFor(page, loads);
    await page.onInit();

    await worker.play([{ control: "start", assets: ["synth.character~d0.1"] }]);

    expect(notifications.map((m) => [m.method, m.params.sampleRate])).toEqual([
      ["audio/sample-rate", 44100],
    ]);
    expect(loads).toHaveLength(1);
    expect(loads[0].sampleRate).toBe(44100);
    const expected = new SynthBuffer(loads[0].synth, loads[0].tones, 44100).soundBuffer;
    expect(Array.from(loads[0].samples as Float32Array)).toEqual(Array.from(expected));
    expect(wrapped.map((w) => w.rate)).toEqual([44100]);
    expect(Array.from(wrapped[0]!.samples)).toEqual(Array.from(expected));
    page.onDispose();
  });
});
