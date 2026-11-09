import type { Animation } from "./Animation";
import type { Color } from "./Color";
import type { Ease } from "./Ease";
import type { FilteredImage } from "./FilteredImage";
import type { Font } from "./Font";
import type { Gradient } from "./Gradient";
import type { Graphic } from "./Graphic";
import type { Image } from "./Image";
import type { LayeredImage } from "./LayeredImage";
import type { Morph } from "./Morph";
import type { Shadow } from "./Shadow";
import type { Style } from "./Style";
import type { Transition } from "./Transition";

export interface UIConfig {
  styles_element_name: string;
  layouts_element_name: string;
  layouts_initial: string[];
  breakpoints: Record<string, number>;
  root_text_size: string;
  ending_transition: string;
}

export interface MovieConfig {
  stop_music: boolean;
}

export interface UIBuiltins {
  config: {
    ui: UIConfig;
    movie: MovieConfig;
  };
  image: Record<string, Image>;
  layered_image: Record<string, LayeredImage>;
  filtered_image: Record<string, FilteredImage>;
  color: Record<string, Color>;
  component: Record<string, any>;
  theme: Record<string, any>;
  style: Record<string, Style>;
  layout: Record<string, any>;
  layer: Record<string, {}>;
  animation: Record<string, Animation>;
  morph: Record<string, Morph>;
  transition: Record<string, Transition>;
  font: Record<string, Font>;
  shadow: Record<string, Shadow>;
  ease: Record<string, Ease>;
  gradient: Record<string, Gradient>;
  graphic: Record<string, Graphic>;
}
