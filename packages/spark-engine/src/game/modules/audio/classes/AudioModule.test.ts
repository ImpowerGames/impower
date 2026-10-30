import { describe, expect, it } from "vitest";
import type { Game } from "../../../core/classes/Game";
import { applyBuiltinDefaults } from "../../../core/utils/applyBuiltinDefaults";
import { audioBuiltinDefinitions } from "../audioBuiltinDefinitions";
import { AudioModule } from "./AudioModule";
import { AudioClockMessage } from "./messages/AudioClockMessage";

class ProbeAudioModule extends AudioModule {
  resolveName(name: string) {
    return this.getAudioData("sound", name);
  }

  resolve(asset: unknown, suffix = "") {
    return (this as any).getData("sound", asset, suffix);
  }
}

const createModule = (synths: Record<string, any>) => {
  const context: any = {
    system: {},
    config: {},
    synth: { ...audioBuiltinDefinitions().synth, ...synths },
  };
  applyBuiltinDefaults(context);
  return new ProbeAudioModule({ context } as unknown as Game);
};

const PARTIAL_SYNTH = {
  $type: "synth",
  $name: "raffles",
  pitch: { frequency: 340 },
};

const SHAPE_ONLY_SYNTH = {
  $type: "synth",
  $name: "operator",
  shape: "sawtooth",
};

const ref = (name: string) => ({ $type: "synth", $name: name });

describe("AudioModule synth resolution (#268)", () => {
  it.each(["ordinary", "toString", "constructor", "hasOwnProperty", "__proto__"])("resolves a synth named %s past empty audio tables", name => {
    const synth = { ...audioBuiltinDefinitions().synth["character"], $type: "synth", $name: name };
    const m = new ProbeAudioModule({
      context: { system: {}, config: {}, audio: {}, layered_audio: {}, synth: { [name]: synth } },
    } as unknown as Game);
    expect(m.resolveName(name).map(data => data.synth?.$name)).toEqual([name]);
  });

  describe("partially-authored synths", () => {
    it("attaches a synth authored with only a pitch", () => {
      const m = createModule({ raffles: PARTIAL_SYNTH });
      expect(m.resolve(ref("raffles"))?.synth).toBeDefined();
    });

    it("fills in the defaults the author did not write", () => {
      const m = createModule({ raffles: PARTIAL_SYNTH });
      const synth = m.resolve(ref("raffles"))!.synth!;
      expect(synth.shape).toBe("triangle");
      expect(synth.volume).toBe(0.5);
      expect(synth.envelope).toBeDefined();
      expect(synth.envelope.attack).toBeGreaterThan(0);
    });

    it("keeps the authored values, and the untouched siblings beside them", () => {
      const m = createModule({ raffles: PARTIAL_SYNTH });
      const synth = m.resolve(ref("raffles"))!.synth!;
      expect(synth.pitch.frequency).toBe(340);
      expect(synth.pitch.frequency_ramp).toBe(0);
    });

    it("preserves identity", () => {
      const m = createModule({ raffles: PARTIAL_SYNTH });
      const synth = m.resolve(ref("raffles"))!.synth!;
      expect(synth.$name).toBe("raffles");
      expect(synth.$type).toBe("synth");
    });

    it("completes a synth that authored only `shape` (the case that used to pass the gate)", () => {
      const m = createModule({ operator: SHAPE_ONLY_SYNTH });
      const synth = m.resolve(ref("operator"))!.synth!;
      expect(synth.shape).toBe("sawtooth");
      expect(synth.volume).toBe(0.5);
      expect(synth.envelope).toBeDefined();
    });
  });

  describe("builtin synths", () => {
    it("still resolves the builtin character voice", () => {
      const m = createModule({});
      const synth = m.resolve(ref("character"))!.synth!;
      expect(synth).toBeDefined();
      expect(synth.shape).toBeDefined();
      expect(synth.envelope).toBeDefined();
    });

    it("leaves an already-complete builtin unchanged", () => {
      const m = createModule({});
      const builtin = audioBuiltinDefinitions().synth["character"];
      expect(m.resolve(ref("character"))!.synth).toEqual(builtin);
    });
  });

  describe("synth detection is a question about type", () => {
    const rawModule = (synths: Record<string, any>) =>
      new ProbeAudioModule({
        context: { system: {}, config: {}, synth: synths },
      } as unknown as Game);

    it("recognises a synth with no `shape` in an uncompleted context", () => {
      const m = rawModule({ raffles: PARTIAL_SYNTH });
      expect(m.resolve(ref("raffles"))?.synth).toBeDefined();
    });

    it("hands that synth through exactly as given", () => {
      const m = rawModule({ raffles: PARTIAL_SYNTH });
      expect(m.resolve(ref("raffles"))!.synth).toEqual(PARTIAL_SYNTH);
    });
  });

  describe("non-synth assets", () => {
    it("does not attach a synth to a plain audio asset", () => {
      const game = {
        context: {
          system: {},
          config: {},
          audio: {
            music: { $type: "audio", $name: "music", src: "music.mp3" },
          },
        },
      } as unknown as Game;
      const m = new ProbeAudioModule(game);
      const d = m.resolve({ $type: "audio", $name: "music" })!;
      expect(d.synth).toBeUndefined();
      expect(d.src).toBe("music.mp3");
    });
  });
});

describe("AudioModule audio clock (#681)", () => {
  it("takes its output latency from the page's latest audio clock reading", () => {
    const module = createModule({});
    expect(module.outputLatency).toBe(0);

    module.onReceiveNotification(
      AudioClockMessage.type.notification({
        time: 1000,
        contextTime: 2,
        outputLatency: 0.04,
      }),
    );
    expect(module.outputLatency).toBe(0.04);

    module.onReceiveNotification(
      AudioClockMessage.type.notification({ time: 3000, outputLatency: 0 }),
    );
    expect(module.outputLatency).toBe(0);
  });
});
