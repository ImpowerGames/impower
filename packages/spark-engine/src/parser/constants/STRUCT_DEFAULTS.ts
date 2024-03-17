import { AUDIO_DEFAULTS } from "../../game/core/specs/defaults/AUDIO_DEFAULTS";
import { EASE_DEFAULTS } from "../../game/core/specs/defaults/EASE_DEFAULTS";
import { FONT_DEFAULTS } from "../../game/core/specs/defaults/FONT_DEFAULTS";
import { IMAGE_DEFAULTS } from "../../game/core/specs/defaults/IMAGE_DEFAULTS";
import { AUDIO_GROUP_DEFAULTS } from "../../game/modules/audio/specs/defaults/AUDIO_GROUP_DEFAULTS";
import { CHANNEL_DEFAULTS } from "../../game/modules/audio/specs/defaults/CHANNEL_DEFAULTS";
import { MIXER_DEFAULTS } from "../../game/modules/audio/specs/defaults/MIXER_DEFAULTS";
import { SYNTH_DEFAULTS } from "../../game/modules/audio/specs/defaults/SYNTH_DEFAULTS";
import { ANIMATION_DEFAULTS } from "../../game/modules/ui/specs/defaults/ANIMATION_DEFAULTS";
import { GRADIENT_DEFAULTS } from "../../game/modules/ui/specs/defaults/GRADIENT_DEFAULTS";
import { IMAGE_GROUP_DEFAULTS } from "../../game/modules/ui/specs/defaults/IMAGE_GROUP_DEFAULTS";
import { SHADOW_DEFAULTS } from "../../game/modules/ui/specs/defaults/SHADOW_DEFAULTS";
import { STYLE_DEFAULTS } from "../../game/modules/ui/specs/defaults/STYLE_DEFAULTS";
import { UI_DEFAULTS } from "../../game/modules/ui/specs/defaults/UI_DEFAULTS";
import { GRAPHIC_DEFAULTS } from "../../game/modules/world/specs/defaults/GRAPHIC_DEFAULTS";
import { CHARACTER_DEFAULTS } from "../../game/modules/writer/specs/defaults/CHARACTER_DEFAULTS";
import { WRITER_DEFAULTS } from "../../game/modules/writer/specs/defaults/WRITER_DEFAULTS";

const STRUCT_DEFAULTS: { [type: string]: { [name: string]: any } } = {
  image: IMAGE_DEFAULTS,
  image_group: IMAGE_GROUP_DEFAULTS,

  audio: AUDIO_DEFAULTS,
  audio_group: AUDIO_GROUP_DEFAULTS,
  mixer: MIXER_DEFAULTS,
  channel: CHANNEL_DEFAULTS,

  synth: SYNTH_DEFAULTS,
  graphic: GRAPHIC_DEFAULTS,

  character: CHARACTER_DEFAULTS,

  writer: WRITER_DEFAULTS,

  style: STYLE_DEFAULTS,
  ui: UI_DEFAULTS,
  animation: ANIMATION_DEFAULTS,

  font: FONT_DEFAULTS,
  shadow: SHADOW_DEFAULTS,
  ease: EASE_DEFAULTS,

  gradient: GRADIENT_DEFAULTS,

  visited: {},

  array: { default: [] },
  html: {},
  css: {},
};

export default STRUCT_DEFAULTS;
