import { _channel } from "../_channel";

export const CHANNEL_DEFAULTS = {
  default: _channel({ mixer: "default" }),
  main: _channel({ mixer: "main" }),
  music: _channel({ mixer: "music", loop: true }),
  sound: _channel({ mixer: "sound" }),
  writer: _channel({ mixer: "sound" }),
};
