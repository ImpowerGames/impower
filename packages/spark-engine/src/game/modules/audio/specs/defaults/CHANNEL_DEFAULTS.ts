import { _channel } from "../_channel";

export const CHANNEL_DEFAULTS = {
  default: _channel({ $name: "default", mixer: "default" }),
  main: _channel({ $name: "main", mixer: "main" }),
  music: _channel({ $name: "music", mixer: "music", loop: true }),
  sound: _channel({ $name: "sound", mixer: "sound" }),
  writer: _channel({ $name: "writer", mixer: "sound" }),
};
