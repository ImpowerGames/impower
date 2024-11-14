import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

const GRID_STEP = 8;
const TIMING_FUNCTIONS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "steps()",
  "cubic-bezier()",
];

export const schema_style: Create<Schema<any>> = () => ({
  $type: "style",
  $name: "$schema",
  position: ["default", "relative", "fixed", "absolute", "sticky"],
  aspect_ratio: ["1/1", "16/9", "9/16", "4/5", "2/3", "2/1"],
  x_overflow: ["visible", "scroll", "clip"],
  y_overflow: ["visible", "scroll", "clip"],
  z: [1, 0, 10],
  width: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  min_width: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  max_width: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  height: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  min_height: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  max_height: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  border_radius: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  border_top_left_radius: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  border_top_right_radius: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  border_bottom_right_radius: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  border_bottom_left_radius: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  inset: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  top: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  right: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  bottom: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  left: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  margin: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  margin_top: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  margin_right: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  margin_bottom: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  margin_left: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  padding: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  padding_top: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  padding_right: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  padding_bottom: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  padding_left: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  gap: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
  flex: [1, 0, 10],
  flex_direction: ["row", "column", "row-reverse", "column-reverse"],
  flex_wrap: ["visible", "wrap", "wrap-reverse"],
  flex_grow: [1, 0, 10],
  flex_shrink: [0, 0, 10],
  align_self: ["center", "stretch", "start", "end"],
  align_items: ["center", "stretch", "start", "end"],
  justify_content: [
    "center",
    "stretch",
    "start",
    "end",
    "between",
    "around",
    "evenly",
  ],
  color: ["none", { $type: "color" }],
  font_family: ["sans", "serif", "mono", { $type: "font" }],
  font_size: [
    "2xs",
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl",
  ],
  font_weight: [100, 0, 700],
  text_align: ["center", "start", "end", "justify"],
  text_wrap: ["visible", "wrap", "clip", "ellipsis"],
  text_transform: ["uppercase", "lowercase", "capitalize"],
  text_decoration_thickness: [1, 0, 10],
  text_decoration_color: ["none", { $type: "color" }],
  text_underline_offset: [1, 0, 10],
  text_stroke: [1, 0, 10],
  line_height: [0.01, 0, 2],
  letter_spacing: [0.01, 0, 2],
  background_color: ["none", { $type: "color" }],
  background_image: [
    "none",
    { $type: "filtered_image" },
    { $type: "layered_image" },
    { $type: "image" },
    { $type: "pattern" },
    { $type: "gradient" },
  ],
  background_position: ["center", "top", "bottom", "left", "right"],
  background_size: ["contain", "cover"],
  mask_image: [
    "none",
    { $type: "filtered_image" },
    { $type: "layered_image" },
    { $type: "image" },
    { $type: "pattern" },
    { $type: "gradient" },
  ],
  clip_path: ["circle", { $type: "path" }],
  outline_color: ["none", { $type: "color" }],
  outline_width: [1, 0, 10],
  border_color: ["none", { $type: "color" }],
  border_width: [1, 0, 10],
  box_shadow: [1, 0, 5],
  opacity: [1.01, 0, 1],
  transform: [],
  translate: [],
  rotate: [],
  scale: [],
  transform_origin: ["center", "top", "left", "bottom", "right"],
  filter: [],
  backdrop_filter: [],
  mix_blend_mode: [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
    "plus-darker",
    "plus-lighter",
  ],
  transition: [],
  transition_delay: [1, 0, 100],
  transition_duration: [1, 0, 100],
  transition_timing_function: [...TIMING_FUNCTIONS, { $type: "ease" }],
  animation: ["none", { $type: "animation" }],
  animation_name: ["none", { $type: "animation" }],
  animation_iteration_count: ["infinite"],
  animation_play_state: ["running", "pause"],
  animation_fill_mode: ["none", "both", "forwards", "backwards"],
  animation_direction: ["normal", "reverse", "alternate", "alternate-reverse"],
  animation_delay: [1, 0, 100],
  animation_duration: [1, 0, 100],
  animation_timing_function: [...TIMING_FUNCTIONS, { $type: "ease" }],
});
