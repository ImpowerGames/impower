import {
  ANIMATION_DEFAULTS,
  AUDIO_DEFAULTS,
  AUDIO_GROUP_DEFAULTS,
  CHARACTER_DEFAULTS,
  EASE_DEFAULTS,
  FONT_DEFAULTS,
  GRADIENT_DEFAULTS,
  GRAPHIC_DEFAULTS,
  IMAGE_DEFAULTS,
  IMAGE_LAYER_DEFAULTS,
  SHADOW_DEFAULTS,
  STYLE_DEFAULTS,
  SYNTH_DEFAULTS,
  TEXT_LAYER_DEFAULTS,
  UI_DEFAULTS,
  WRITER_DEFAULTS,
} from "../../game";

const STRUCT_DEFAULTS: { [type: string]: { [name: string]: any } } = {
  text_layer: TEXT_LAYER_DEFAULTS,

  image: IMAGE_DEFAULTS,
  image_layer: IMAGE_LAYER_DEFAULTS,

  audio: AUDIO_DEFAULTS,
  audio_group: AUDIO_GROUP_DEFAULTS,

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

  array: { default: [] },
  html: { default: [] },
  css: { default: [] },
};

export default STRUCT_DEFAULTS;
