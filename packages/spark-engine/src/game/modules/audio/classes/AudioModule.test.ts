import { describe, expect, it } from "vitest";
import type { Game } from "../../../core/classes/Game";
import { applyBuiltinDefaults } from "../../../core/utils/applyBuiltinDefaults";
import { audioBuiltinDefinitions } from "../audioBuiltinDefinitions";
import { AudioModule } from "./AudioModule";

/**
 * A character voice authored as `define x as synth with ... end` reaches the
 * runtime context carrying ONLY the properties the author wrote -- nothing
 * merges the `synth` type's defaults in along the way. These tests pin that
 * such a synth still plays (#268).
 *
 * They assert on the synth the module hands to the audio player, because that
 * is the thing the player synthesises from. What made #268 silent was not a
 * wrong value but a MISSING one: `d.synth` was never assigned at all.
 */

/** Exposes the protected resolution path under test. */
class ProbeAudioModule extends AudioModule {
  resolve(asset: unknown, suffix = "") {
    return (this as any).getData("sound", asset, suffix);
  }
}

/**
 * Builds the context the way `Game` does: authored defines are merged in
 * sparse, then completed against their type's `$default` before any module
 * sees them. Going through `applyBuiltinDefaults` here rather than
 * hand-completing the fixtures keeps these tests honest about the real path.
 */
const createModule = (synths: Record<string, any>) => {
  const context: any = {
    system: {},
    config: {},
    // The builtins are full objects because they are built by calling
    // `default_synth()`; the authored ones deliberately are not.
    synth: { ...audioBuiltinDefinitions().synth, ...synths },
  };
  applyBuiltinDefaults(context);
  return new ProbeAudioModule({ context } as unknown as Game);
};

/** A voice authored with nothing but a pitch -- the shape #268 reported. */
const PARTIAL_SYNTH = {
  $type: "synth",
  $name: "raffles",
  pitch: { frequency: 340 },
};

/** A voice that happens to author `shape`, so it passed the old gate. */
const SHAPE_ONLY_SYNTH = {
  $type: "synth",
  $name: "operator",
  shape: "sawtooth",
};

const ref = (name: string) => ({ $type: "synth", $name: name });

describe("AudioModule synth resolution (#268)", () => {
  describe("partially-authored synths", () => {
    it("attaches a synth authored with only a pitch", () => {
      // The regression itself: this used to be undefined, so nothing played.
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
      // Deep-merged, not replaced wholesale.
      expect(synth.pitch.frequency_ramp).toBe(0);
    });

    it("preserves identity", () => {
      const m = createModule({ raffles: PARTIAL_SYNTH });
      const synth = m.resolve(ref("raffles"))!.synth!;
      expect(synth.$name).toBe("raffles");
      expect(synth.$type).toBe("synth");
    });

    it("completes a synth that authored only `shape` (the case that used to pass the gate)", () => {
      // These played before the fix, but sparsely -- no envelope, no volume.
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
      const builtin = audioBuiltinDefinitions().synth.character;
      expect(m.resolve(ref("character"))!.synth).toEqual(builtin);
    });
  });

  describe("synth detection is a question about type", () => {
    /**
     * DEFENCE IN DEPTH, not the production path. Since `Game` completes every
     * define, a synth arriving here always has `shape` and the old
     * `"shape" in resolvedAsset` gate would pass too -- reverting it does not
     * fail any other test in this repo, and I would rather say so than imply
     * this carries the fix.
     *
     * It earns its place by making the module correct on its own terms: these
     * contexts are built WITHOUT `applyBuiltinDefaults`, which is what any
     * caller constructing a context by hand gets. Identifying a synth by the
     * one property someone happened to author is how #268 turned a sparse
     * define into total silence.
     */
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
