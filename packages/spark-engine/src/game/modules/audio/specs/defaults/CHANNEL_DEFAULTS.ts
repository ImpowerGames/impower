import { MIXER_DEFAULTS } from "./MIXER_DEFAULTS";
import { _channel } from "./_channel";

export const CHANNEL_DEFAULTS = {
  default: _channel({ mixer: MIXER_DEFAULTS.default }),
  main: _channel({ mixer: MIXER_DEFAULTS.main }),
  music: _channel({ mixer: MIXER_DEFAULTS.music, loop: true }),
  sound: _channel({ mixer: MIXER_DEFAULTS.sound }),
  writer: _channel({ mixer: MIXER_DEFAULTS.sound }),
};
