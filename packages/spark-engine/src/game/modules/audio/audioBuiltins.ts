import { default_audio } from "./constructors/default_audio";
import { default_layered_audio } from "./constructors/default_layered_audio";
import { default_channel } from "./constructors/default_channel";
import { default_mixer } from "./constructors/default_mixer";
import { default_synth } from "./constructors/default_synth";
import { schema_synth } from "./constructors/schema_synth";
import {
  random_synth_beep,
  random_synth_blip,
  random_synth_boom,
  random_synth_clack,
  random_synth_coin,
  random_synth_hurt,
  random_synth_jump,
  random_synth_lose,
  random_synth_powerup,
  random_synth_push,
  random_synth,
  random_synth_snap,
  random_synth_tap,
  random_synth_zap,
} from "./constructors/random_synth";

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

export const audioSchemaDefinitions = () => ({
  synth: {
    $schema: schema_synth(),
  } as Record<string, ReturnType<typeof schema_synth>>,
});

export const audioRandomDefinitions = () => ({
  synth: {
    $random: random_synth(),
    "$random:coin": random_synth_coin(),
    "$random:jump": random_synth_jump(),
    "$random:powerup": random_synth_powerup(),
    "$random:lose": random_synth_lose(),
    "$random:zap": random_synth_zap(),
    "$random:hurt": random_synth_hurt(),
    "$random:boom": random_synth_boom(),
    "$random:push": random_synth_push(),
    "$random:blip": random_synth_blip(),
    "$random:beep": random_synth_beep(),
    "$random:tap": random_synth_tap(),
    "$random:snap": random_synth_snap(),
    "$random:clack": random_synth_clack(),
  } as Record<string, ReturnType<typeof random_synth>>,
});

export type AudioBuiltins = ReturnType<typeof audioBuiltinDefinitions>;
