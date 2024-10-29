import { _audio } from "./constructors/_audio";
import { _layeredAudio } from "./constructors/_layeredAudio";
import { _channel } from "./constructors/_channel";
import { _mixer } from "./constructors/_mixer";
import { _synth } from "./constructors/_synth";

export const audioBuiltins = () => ({
  audio: {
    $default: _audio({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof _audio>>,
  layered_audio: {
    $default: _layeredAudio({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof _layeredAudio>>,
  synth: {
    $default: _synth({
      $name: "$default",
      envelope: {
        attack: 0.007,
        decay: 0.003,
        sustain: 0.035,
        release: 0.01,
      },
    }),
    character: _synth({
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
    writer: _synth({
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
  } as Record<string, ReturnType<typeof _synth>>,
  mixer: {
    $default: _mixer({
      $name: "$default",
    }),
    main: _mixer({
      $name: "main",
    }),
    music: _mixer({
      $name: "music",
    }),
    sound: _mixer({
      $name: "sound",
    }),
    writer: _mixer({
      $name: "writer",
    }),
  } as Record<string, ReturnType<typeof _mixer>>,
  channel: {
    $default: _channel({
      $name: "$default",
      mixer: "",
    }),
    main: _channel({
      $name: "main",
      mixer: "main",
    }),
    music: _channel({
      $name: "music",
      mixer: "music",
      loop: true,
    }),
    sound: _channel({
      $name: "sound",
      mixer: "sound",
    }),
    writer: _channel({
      $name: "writer",
      mixer: "sound",
    }),
  } as Record<string, ReturnType<typeof _channel>>,
});

export type AudioBuiltins = ReturnType<typeof audioBuiltins>;
