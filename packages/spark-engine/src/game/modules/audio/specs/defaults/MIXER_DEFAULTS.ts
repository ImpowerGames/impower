import { _mixer } from "../_mixer";

export const MIXER_DEFAULTS = {
  default: _mixer({ $name: "default" }),
  main: _mixer({ $name: "main" }),
  music: _mixer({ $name: "music" }),
  sound: _mixer({ $name: "sound" }),
  writer: _mixer({ $name: "writer" }),
};
