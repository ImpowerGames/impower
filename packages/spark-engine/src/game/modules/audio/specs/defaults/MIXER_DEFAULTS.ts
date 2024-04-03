import { _mixer } from "../_mixer";

export const MIXER_DEFAULTS = {
  default: _mixer({ $type: "mixer", $name: "default" }),
  main: _mixer({ $type: "mixer", $name: "main" }),
  music: _mixer({ $type: "mixer", $name: "music" }),
  sound: _mixer({ $type: "mixer", $name: "sound" }),
  writer: _mixer({ $type: "mixer", $name: "writer" }),
};
