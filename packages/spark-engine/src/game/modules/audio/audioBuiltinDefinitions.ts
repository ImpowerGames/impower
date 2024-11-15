import { default_audio } from "./constructors/default_audio";
import { default_layered_audio } from "./constructors/default_layered_audio";
import { default_channel } from "./constructors/default_channel";
import { default_mixer } from "./constructors/default_mixer";
import { default_synth } from "./constructors/default_synth";

export const audioBuiltinDefinitions = () => ({
  audio: {
    $default: default_audio(),
  } as Record<string, ReturnType<typeof default_audio>>,
  layered_audio: {
    $default: default_layered_audio(),
  } as Record<string, ReturnType<typeof default_layered_audio>>,
  synth: {
    $default: default_synth(),
    character: default_synth({
      $name: "character",
      shape: "triangle",
      envelope: {
        attack: 0.007,
        decay: 0.003,
        sustain: 0.035,
        release: 0.01,
      },
      pitch: {
        frequency: 440,
      },
    }),
    writer: default_synth({
      $name: "writer",
      shape: "whitenoise",
      envelope: {
        attack: 0.01,
        decay: 0.003,
        sustain: 0.04,
        release: 0.01,
        level: 0.3,
      },
      pitch: { frequency: 4790 },
      arpeggio: {
        on: true,
        rate: 100,
        levels: [0.05, 0.15, 0.1, 0.01, 0, 0.05, 0],
      },
      reverb: {
        on: true,
      },
    }),
  } as Record<string, ReturnType<typeof default_synth>>,
  mixer: {
    $default: default_mixer(),
    main: default_mixer({
      $name: "main",
    }),
    music: default_mixer({
      $name: "music",
    }),
    sound: default_mixer({
      $name: "sound",
    }),
    writer: default_mixer({
      $name: "writer",
    }),
  } as Record<string, ReturnType<typeof default_mixer>>,
  channel: {
    $default: default_channel(),
    main: default_channel({
      $name: "main",
      mixer: "main",
    }),
    music: default_channel({
      $name: "music",
      mixer: "music",
      loop: true,
    }),
    sound: default_channel({
      $name: "sound",
      mixer: "sound",
    }),
    writer: default_channel({
      $name: "writer",
      mixer: "sound",
    }),
  } as Record<string, ReturnType<typeof default_channel>>,
});

export type AudioBuiltins = ReturnType<typeof audioBuiltinDefinitions>;