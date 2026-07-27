import { describe, expect, it } from "vitest";
import { DEFAULT_BUILTIN_DEFINITIONS } from "../../modules/DEFAULT_BUILTIN_DEFINITIONS";
import { applyBuiltinDefaults, inheritDefaults } from "./applyBuiltinDefaults";

/**
 * Authored defines reach the runtime carrying only the properties the author
 * wrote. `Game` makes each one inherit its type's `$default` before any module
 * reads it, so consumers never have to invent their own fallbacks (#268).
 */

describe("inheritDefaults", () => {
  it("fills in what the author did not write", () => {
    const result = inheritDefaults(
      { $type: "synth", $name: "raffles", volume: 0.9 },
      { $type: "synth", $name: "$default", shape: "triangle", volume: 0.5 },
    );
    expect(result).toEqual({
      $type: "synth",
      $name: "raffles",
      shape: "triangle",
      volume: 0.9,
    });
  });

  it("never lets a default overwrite an authored value", () => {
    const result = inheritDefaults({ a: 0 }, { a: 99 });
    // 0 is authored, and falsy -- a `||` merge would have clobbered it.
    expect(result.a).toBe(0);
  });

  it("keeps the instance's own identity", () => {
    const result = inheritDefaults(
      { $type: "synth", $name: "raffles" },
      { $type: "synth", $name: "$default", shape: "triangle" },
    );
    expect(result.$name).toBe("raffles");
  });

  it("merges nested groups per leaf rather than replacing them", () => {
    const result = inheritDefaults(
      { pitch: { frequency: 340 } },
      { pitch: { frequency: 440, frequency_ramp: 0, frequency_jerk: 3 } },
    );
    expect(result.pitch).toEqual({
      frequency: 340,
      frequency_ramp: 0,
      frequency_jerk: 3,
    });
  });

  it("recurses to any depth", () => {
    const result = inheritDefaults(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 9, d: 2 }, e: 3 } },
    );
    expect(result).toEqual({ a: { b: { c: 1, d: 2 }, e: 3 } });
  });

  it("treats an authored array as a leaf, not something to merge into", () => {
    const result = inheritDefaults(
      { tones: [1, 2] },
      { tones: [7, 8, 9, 10] },
    );
    expect(result.tones).toEqual([1, 2]);
  });

  it("inherits a default array when the author wrote none", () => {
    const result = inheritDefaults({}, { tones: [0, 4, 7] });
    expect(result.tones).toEqual([0, 4, 7]);
  });

  it("does not alias the defaults, so one instance cannot mutate another", () => {
    const defaults = { envelope: { attack: 0.007 }, tones: [0, 4] };
    const a: any = inheritDefaults({}, defaults);
    const b: any = inheritDefaults({}, defaults);
    a.envelope.attack = 99;
    a.tones.push(11);
    expect(b.envelope.attack).toBe(0.007);
    expect(b.tones).toEqual([0, 4]);
    expect(defaults.envelope.attack).toBe(0.007);
  });

  it("leaves the input untouched", () => {
    const authored = { volume: 0.9 };
    inheritDefaults(authored, { volume: 0.5, shape: "triangle" });
    expect(authored).toEqual({ volume: 0.9 });
  });
});

describe("applyBuiltinDefaults", () => {
  it("completes every authored define of a type", () => {
    const context: any = {
      synth: {
        $default: { $type: "synth", shape: "triangle", volume: 0.5 },
        raffles: { $type: "synth", $name: "raffles", volume: 0.9 },
        bunny: { $type: "synth", $name: "bunny" },
      },
    };
    applyBuiltinDefaults(context);
    expect(context.synth.raffles).toEqual({
      $type: "synth",
      $name: "raffles",
      shape: "triangle",
      volume: 0.9,
    });
    expect(context.synth.bunny.shape).toBe("triangle");
    expect(context.synth.bunny.volume).toBe(0.5);
  });

  it("leaves the $default itself alone", () => {
    const context: any = {
      synth: {
        $default: { $type: "synth", shape: "triangle" },
        raffles: { $type: "synth", shape: "sawtooth" },
      },
    };
    applyBuiltinDefaults(context);
    expect(context.synth.$default).toEqual({ $type: "synth", shape: "triangle" });
  });

  it("skips types that have no $default", () => {
    const context: any = { config: { interpreter: { directives: {} } } };
    applyBuiltinDefaults(context);
    expect(context.config).toEqual({ interpreter: { directives: {} } });
  });

  it("is a no-op for types whose $default carries no real properties", () => {
    // The structural UI types -- style/screen/component -- are meant to be
    // sparse; being sparse IS the semantics of a cascade. Their `$default`
    // holds only `$`-prefixed metadata, so they must come out untouched.
    const context: any = {
      style: {
        $default: { $type: "style", $name: "$default", $recursive: true },
        my_style: { $type: "style", $name: "my_style", color: "red" },
      },
    };
    applyBuiltinDefaults(context);
    expect(context.style.my_style).toEqual({
      $type: "style",
      $name: "my_style",
      color: "red",
      $recursive: true,
    });
  });

  it("ignores non-object entries", () => {
    const context: any = {
      system: { previewing: true },
      synth: { $default: { shape: "triangle" }, broken: "not-an-object" },
    };
    expect(() => applyBuiltinDefaults(context)).not.toThrow();
    expect(context.synth.broken).toBe("not-an-object");
  });
});

describe("against the real builtin definitions", () => {
  /**
   * #268 was reported for synths, but nothing inherited -- these are the other
   * types with real defaults to lose. Pinning a few of the worst so a
   * regression shows up as a named failure rather than as mysteriously wrong
   * pacing.
   */
  it("completes a partially-authored define for every type with defaults", () => {
    const builtins: any = DEFAULT_BUILTIN_DEFINITIONS;
    const context: any = {};
    const typesWithDefaults: string[] = [];
    for (const [type, structs] of Object.entries<any>(builtins)) {
      const dflt = structs?.["$default"];
      if (!dflt) {
        continue;
      }
      const realKeys = Object.keys(dflt).filter((k) => !k.startsWith("$"));
      if (realKeys.length === 0) {
        continue;
      }
      typesWithDefaults.push(type);
      context[type] = {
        $default: dflt,
        partial: { $type: type, $name: "partial" },
      };
    }
    // Guards the loop itself: if this collapses to a handful, the assertions
    // below stop meaning anything.
    expect(typesWithDefaults.length).toBeGreaterThan(15);

    applyBuiltinDefaults(context);

    for (const type of typesWithDefaults) {
      const dflt = builtins[type]["$default"];
      const completed = context[type].partial;
      for (const key of Object.keys(dflt).filter((k) => !k.startsWith("$"))) {
        expect(completed[key], `${type}.${key}`).toBeDefined();
      }
      expect(completed.$name, `${type} identity`).toBe("partial");
    }
  });

  it("gives a partial typewriter the real pause scales", () => {
    // These are the numbers InterpreterModule's inline fallbacks got wrong by
    // 5-16x, which is what made this class of bug invisible.
    const context: any = {
      typewriter: {
        $default: DEFAULT_BUILTIN_DEFINITIONS.typewriter.$default,
        custom: { $type: "typewriter", $name: "custom", letter_pause: 0.05 },
      },
    };
    applyBuiltinDefaults(context);
    const t = context.typewriter.custom;
    expect(t.letter_pause).toBe(0.05);
    expect(t.phrase_pause_scale).toBe(5);
    expect(t.em_dash_pause_scale).toBe(16);
    expect(t.stressed_pause_scale).toBe(10);
    expect(t.punctuated_pause_scale).toBe(15);
    expect(t.min_syllable_length).toBe(3);
  });

  it("gives a partial synth a complete envelope", () => {
    const context: any = {
      synth: {
        $default: DEFAULT_BUILTIN_DEFINITIONS.synth.$default,
        raffles: {
          $type: "synth",
          $name: "raffles",
          pitch: { frequency: 340 },
        },
      },
    };
    applyBuiltinDefaults(context);
    const s = context.synth.raffles;
    expect(s.pitch.frequency).toBe(340);
    expect(s.pitch.frequency_ramp).toBe(0);
    expect(s.shape).toBe("triangle");
    expect(s.envelope.attack).toBeGreaterThan(0);
  });
});
