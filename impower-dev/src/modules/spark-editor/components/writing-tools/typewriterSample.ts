import { inheritDefaults } from "@impower/spark-engine/src/game/core/utils/applyBuiltinDefaults";
import { randomizeProperties } from "@impower/spark-engine/src/game/core/utils/randomizeProperties";
import { SynthBuffer } from "@impower/spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { random_synth_typewriter } from "@impower/spark-engine/src/game/modules/audio/constructors/random_synth";
import { schema_synth } from "@impower/spark-engine/src/game/modules/audio/constructors/schema_synth";
import type {
  Synth,
  SynthConfig,
} from "@impower/spark-engine/src/game/modules/audio/types/Synth";

export const SAMPLE_LINE = "Wait.   Someone is at the door.";
export const SAMPLE_SYLLABLES = [
  0, 0.075, 0.4, 0.475, 0.55, 0.625, 0.7, 0.775, 0.85, 0.925,
];

export function rollTypewriter(rng = Math.random): SynthConfig {
  const patch: SynthConfig = {};
  randomizeProperties<Synth>(
    patch,
    schema_synth(),
    random_synth_typewriter(),
    undefined,
    rng,
  );
  return patch;
}

function luaValue(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    const rows = value.map(
      (item) => indent + "  " + luaValue(item, indent + "  "),
    );
    return "{\n" + rows.join(",\n") + "\n" + indent + "}";
  }
  if (value && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([key, item]) => key + " = " + luaValue(item, indent + "  "),
    );
    if (fields.some((field) => field.includes("\n"))) {
      return (
        "{\n" +
        fields.map((field) => indent + "  " + field).join(",\n") +
        "\n" +
        indent +
        "}"
      );
    }
    return "{ " + fields.join(", ") + " }";
  }
  return JSON.stringify(value);
}

export function typewriterDefinition(patch: SynthConfig): string {
  const fields = Object.entries(patch).map(
    ([key, value]) => "  " + key + " = " + luaValue(value, "  "),
  );
  return ["define story_key as synth with", ...fields, "end"].join("\n");
}

export function typewriterSample(
  patch: SynthConfig,
  defaults: Synth,
  sampleRate: number,
) {
  const synth = inheritDefaults(patch, defaults) as Synth;
  const tones = [
    { time: 0 },
    ...SAMPLE_SYLLABLES.map((time) => ({ time: 0.4 + time })),
  ];
  const samples = new SynthBuffer(synth, tones, sampleRate).soundBuffer;
  for (let i = 0; i < samples.length; i++) samples[i]! *= synth.volume;
  return samples;
}
