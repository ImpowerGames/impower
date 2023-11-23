import {
  ANIMATION_DEFAULTS,
  ASSET_DEFAULTS,
  CHARACTER_DEFAULTS,
  EASE_DEFAULTS,
  FONT_DEFAULTS,
  GRADIENT_DEFAULTS,
  GRAPHIC_DEFAULTS,
  SHADOW_DEFAULTS,
  STYLE_DEFAULTS,
  SYNTH_DEFAULTS,
  UI_DEFAULTS,
  WRITER_DEFAULTS,
} from "../../game";

export const STRUCT_DEFAULTS: { [type: string]: { [name: string]: any } } = {
  Camera: {},
  Asset: ASSET_DEFAULTS,
  Graphic: GRAPHIC_DEFAULTS,
  Font: FONT_DEFAULTS,
  Shadow: SHADOW_DEFAULTS,
  Gradient: GRADIENT_DEFAULTS,
  Ease: EASE_DEFAULTS,
  Animation: ANIMATION_DEFAULTS,
  Style: STYLE_DEFAULTS,
  UI: UI_DEFAULTS,
  Character: CHARACTER_DEFAULTS,
  Writer: WRITER_DEFAULTS,
  Synth: SYNTH_DEFAULTS,
};
