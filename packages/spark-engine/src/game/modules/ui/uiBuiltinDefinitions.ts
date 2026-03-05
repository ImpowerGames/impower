import { default_animation } from "./constructors/default_animation";
import { default_color } from "./constructors/default_color";
import { default_component } from "./constructors/default_component";
import { default_ease } from "./constructors/default_ease";
import { default_filtered_image } from "./constructors/default_filtered_image";
import { default_font } from "./constructors/default_font";
import { default_gradient } from "./constructors/default_gradient";
import { default_graphic } from "./constructors/default_graphic";
import { default_image } from "./constructors/default_image";
import { default_layered_image } from "./constructors/default_layered_image";
import { default_screen } from "./constructors/default_screen";
import { default_shadow } from "./constructors/default_shadow";
import { default_style } from "./constructors/default_style";
import { default_theme } from "./constructors/default_theme";
import { default_transition } from "./constructors/default_transition";

export const uiBuiltinDefinitions = () => ({
  config: {
    ui: {
      styles_element_name: "styles",
      screens_element_name: "screens",
      breakpoints: {
        xs: 400,
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
      },
    },
  },
  image: {
    $default: default_image(),
  } as Record<string, ReturnType<typeof default_image>>,
  layered_image: {
    $default: default_layered_image(),
  } as Record<string, ReturnType<typeof default_layered_image>>,
  filtered_image: {
    $default: default_filtered_image(),
  } as Record<string, ReturnType<typeof default_filtered_image>>,
  color: {
    $default: default_color(),

    red: default_color({ value: "rgb(220,38,38)" }),
    red_10: default_color({ value: "rgb(76,5,5)" }),
    red_20: default_color({ value: "rgb(127,29,29)" }),
    red_30: default_color({ value: "rgb(153,27,27)" }),
    red_40: default_color({ value: "rgb(185,28,28)" }),
    red_50: default_color({ value: "rgb(220,38,38)" }),
    red_60: default_color({ value: "rgb(239,68,68)" }),
    red_70: default_color({ value: "rgb(248,113,113)" }),
    red_80: default_color({ value: "rgb(252,165,165)" }),
    red_90: default_color({ value: "rgb(254,205,205)" }),
    red_95: default_color({ value: "rgb(254,226,226)" }),
    red_99: default_color({ value: "rgb(254,242,242)" }),

    orange: default_color({ value: "rgb(234,88,12)" }),
    orange_10: default_color({ value: "rgb(77,24,6)" }),
    orange_20: default_color({ value: "rgb(124,45,18)" }),
    orange_30: default_color({ value: "rgb(154,52,18)" }),
    orange_40: default_color({ value: "rgb(194,65,12)" }),
    orange_50: default_color({ value: "rgb(234,88,12)" }),
    orange_60: default_color({ value: "rgb(249,115,22)" }),
    orange_70: default_color({ value: "rgb(251,146,60)" }),
    orange_80: default_color({ value: "rgb(253,186,116)" }),
    orange_90: default_color({ value: "rgb(254,215,170)" }),
    orange_95: default_color({ value: "rgb(255,237,213)" }),
    orange_99: default_color({ value: "rgb(255,247,237)" }),

    amber: default_color({ value: "rgb(217,119,6)" }),
    amber_10: default_color({ value: "rgb(77,29,4)" }),
    amber_20: default_color({ value: "rgb(120,53,15)" }),
    amber_30: default_color({ value: "rgb(146,64,14)" }),
    amber_40: default_color({ value: "rgb(180,83,9)" }),
    amber_50: default_color({ value: "rgb(217,119,6)" }),
    amber_60: default_color({ value: "rgb(245,158,11)" }),
    amber_70: default_color({ value: "rgb(251,191,36)" }),
    amber_80: default_color({ value: "rgb(252,211,77)" }),
    amber_90: default_color({ value: "rgb(253,230,138)" }),
    amber_95: default_color({ value: "rgb(254,243,199)" }),
    amber_99: default_color({ value: "rgb(255,251,235)" }),

    yellow: default_color({ value: "rgb(202,138,4)" }),
    yellow_10: default_color({ value: "rgb(72,35,7)" }),
    yellow_20: default_color({ value: "rgb(113,63,18)" }),
    yellow_30: default_color({ value: "rgb(133,76,8)" }),
    yellow_40: default_color({ value: "rgb(161,98,7)" }),
    yellow_50: default_color({ value: "rgb(202,138,4)" }),
    yellow_60: default_color({ value: "rgb(234,179,8)" }),
    yellow_70: default_color({ value: "rgb(244,220,64)" }),
    yellow_80: default_color({ value: "rgb(250,232,103)" }),
    yellow_90: default_color({ value: "rgb(253,244,153)" }),
    yellow_95: default_color({ value: "rgb(254,249,195)" }),
    yellow_99: default_color({ value: "rgb(254,252,232)" }),

    lime: default_color({ value: "rgb(101,163,13)" }),
    lime_10: default_color({ value: "rgb(30,50,10)" }),
    lime_20: default_color({ value: "rgb(54,83,20)" }),
    lime_30: default_color({ value: "rgb(63,98,18)" }),
    lime_40: default_color({ value: "rgb(77,124,15)" }),
    lime_50: default_color({ value: "rgb(101,163,13)" }),
    lime_60: default_color({ value: "rgb(132,204,22)" }),
    lime_70: default_color({ value: "rgb(163,230,53)" }),
    lime_80: default_color({ value: "rgb(190,242,100)" }),
    lime_90: default_color({ value: "rgb(217,249,157)" }),
    lime_95: default_color({ value: "rgb(236,252,203)" }),
    lime_99: default_color({ value: "rgb(247,254,231)" }),

    green: default_color({ value: "rgb(22,163,74)" }),
    green_10: default_color({ value: "rgb(5,46,22)" }),
    green_20: default_color({ value: "rgb(20,83,45)" }),
    green_30: default_color({ value: "rgb(22,101,52)" }),
    green_40: default_color({ value: "rgb(21,128,61)" }),
    green_50: default_color({ value: "rgb(22,163,74)" }),
    green_60: default_color({ value: "rgb(34,197,94)" }),
    green_70: default_color({ value: "rgb(74,222,128)" }),
    green_80: default_color({ value: "rgb(134,239,172)" }),
    green_90: default_color({ value: "rgb(187,247,208)" }),
    green_95: default_color({ value: "rgb(220,252,231)" }),
    green_99: default_color({ value: "rgb(240,253,244)" }),

    emerald: default_color({ value: "rgb(5,150,105)" }),
    emerald_10: default_color({ value: "rgb(2,44,34)" }),
    emerald_20: default_color({ value: "rgb(6,78,59)" }),
    emerald_30: default_color({ value: "rgb(6,95,70)" }),
    emerald_40: default_color({ value: "rgb(4,120,87)" }),
    emerald_50: default_color({ value: "rgb(5,150,105)" }),
    emerald_60: default_color({ value: "rgb(16,185,129)" }),
    emerald_70: default_color({ value: "rgb(52,211,153)" }),
    emerald_80: default_color({ value: "rgb(110,231,183)" }),
    emerald_90: default_color({ value: "rgb(167,243,208)" }),
    emerald_95: default_color({ value: "rgb(209,250,229)" }),
    emerald_99: default_color({ value: "rgb(236,253,245)" }),

    teal: default_color({ value: "rgb(13,148,136)" }),
    teal_10: default_color({ value: "rgb(4,47,46)" }),
    teal_20: default_color({ value: "rgb(19,78,74)" }),
    teal_30: default_color({ value: "rgb(17,94,89)" }),
    teal_40: default_color({ value: "rgb(15,118,110)" }),
    teal_50: default_color({ value: "rgb(13,148,136)" }),
    teal_60: default_color({ value: "rgb(20,183,171)" }),
    teal_70: default_color({ value: "rgb(45,212,191)" }),
    teal_80: default_color({ value: "rgb(94,234,212)" }),
    teal_90: default_color({ value: "rgb(153,246,228)" }),
    teal_95: default_color({ value: "rgb(204,251,241)" }),
    teal_99: default_color({ value: "rgb(240,253,250)" }),

    cyan: default_color({ value: "rgb(8,145,178)" }),
    cyan_10: default_color({ value: "rgb(8,51,68)" }),
    cyan_20: default_color({ value: "rgb(22,78,99)" }),
    cyan_30: default_color({ value: "rgb(21,94,117)" }),
    cyan_40: default_color({ value: "rgb(14,116,144)" }),
    cyan_50: default_color({ value: "rgb(8,145,178)" }),
    cyan_60: default_color({ value: "rgb(6,182,212)" }),
    cyan_70: default_color({ value: "rgb(34,211,238)" }),
    cyan_80: default_color({ value: "rgb(103,232,249)" }),
    cyan_90: default_color({ value: "rgb(165,243,252)" }),
    cyan_95: default_color({ value: "rgb(207,250,254)" }),
    cyan_99: default_color({ value: "rgb(236,254,255)" }),

    sky: default_color({ value: "rgb(2,132,199)" }),
    sky_10: default_color({ value: "rgb(8,47,73)" }),
    sky_20: default_color({ value: "rgb(12,74,110)" }),
    sky_30: default_color({ value: "rgb(7,89,133)" }),
    sky_40: default_color({ value: "rgb(3,105,161)" }),
    sky_50: default_color({ value: "rgb(2,132,199)" }),
    sky_60: default_color({ value: "rgb(14,165,233)" }),
    sky_70: default_color({ value: "rgb(56,189,248)" }),
    sky_80: default_color({ value: "rgb(125,211,252)" }),
    sky_90: default_color({ value: "rgb(186,230,253)" }),
    sky_95: default_color({ value: "rgb(224,242,254)" }),
    sky_99: default_color({ value: "rgb(240,249,255)" }),

    blue: default_color({ value: "rgb(37,99,235)" }),
    blue_10: default_color({ value: "rgb(23,37,84)" }),
    blue_20: default_color({ value: "rgb(30,58,138)" }),
    blue_30: default_color({ value: "rgb(30,64,175)" }),
    blue_40: default_color({ value: "rgb(29,78,216)" }),
    blue_50: default_color({ value: "rgb(37,99,235)" }),
    blue_60: default_color({ value: "rgb(59,130,246)" }),
    blue_70: default_color({ value: "rgb(96,165,250)" }),
    blue_80: default_color({ value: "rgb(147,197,253)" }),
    blue_90: default_color({ value: "rgb(191,219,253)" }),
    blue_95: default_color({ value: "rgb(219,234,254)" }),
    blue_99: default_color({ value: "rgb(239,246,255)" }),

    indigo: default_color({ value: "rgb(79,70,229)" }),
    indigo_10: default_color({ value: "rgb(30,27,75)" }),
    indigo_20: default_color({ value: "rgb(49,46,129)" }),
    indigo_30: default_color({ value: "rgb(55,48,163)" }),
    indigo_40: default_color({ value: "rgb(67,56,202)" }),
    indigo_50: default_color({ value: "rgb(79,70,229)" }),
    indigo_60: default_color({ value: "rgb(99,102,241)" }),
    indigo_70: default_color({ value: "rgb(129,140,248)" }),
    indigo_80: default_color({ value: "rgb(165,180,252)" }),
    indigo_90: default_color({ value: "rgb(199,210,254)" }),
    indigo_95: default_color({ value: "rgb(224,231,255)" }),
    indigo_99: default_color({ value: "rgb(238,242,255)" }),

    violet: default_color({ value: "rgb(124,58,237)" }),
    violet_10: default_color({ value: "rgb(46,16,101)" }),
    violet_20: default_color({ value: "rgb(76,29,149)" }),
    violet_30: default_color({ value: "rgb(91,33,182)" }),
    violet_40: default_color({ value: "rgb(109,40,217)" }),
    violet_50: default_color({ value: "rgb(124,58,237)" }),
    violet_60: default_color({ value: "rgb(139,92,246)" }),
    violet_70: default_color({ value: "rgb(167,139,250)" }),
    violet_80: default_color({ value: "rgb(196,181,253)" }),
    violet_90: default_color({ value: "rgb(221,214,254)" }),
    violet_95: default_color({ value: "rgb(237,233,254)" }),
    violet_99: default_color({ value: "rgb(245,243,255)" }),

    purple: default_color({ value: "rgb(147,51,234)" }),
    purple_10: default_color({ value: "rgb(59,7,100)" }),
    purple_20: default_color({ value: "rgb(88,28,135)" }),
    purple_30: default_color({ value: "rgb(107,33,168)" }),
    purple_40: default_color({ value: "rgb(126,34,206)" }),
    purple_50: default_color({ value: "rgb(147,51,234)" }),
    purple_60: default_color({ value: "rgb(168,85,247)" }),
    purple_70: default_color({ value: "rgb(192,132,252)" }),
    purple_80: default_color({ value: "rgb(216,180,254)" }),
    purple_90: default_color({ value: "rgb(233,213,255)" }),
    purple_95: default_color({ value: "rgb(243,232,255)" }),
    purple_99: default_color({ value: "rgb(250,245,255)" }),

    fuchsia: default_color({ value: "rgb(192,38,211)" }),
    fuchsia_10: default_color({ value: "rgb(74,4,76)" }),
    fuchsia_20: default_color({ value: "rgb(112,26,117)" }),
    fuchsia_30: default_color({ value: "rgb(134,25,143)" }),
    fuchsia_40: default_color({ value: "rgb(162,28,175)" }),
    fuchsia_50: default_color({ value: "rgb(192,38,211)" }),
    fuchsia_60: default_color({ value: "rgb(217,70,239)" }),
    fuchsia_70: default_color({ value: "rgb(232,121,249)" }),
    fuchsia_80: default_color({ value: "rgb(240,171,252)" }),
    fuchsia_90: default_color({ value: "rgb(245,208,255)" }),
    fuchsia_95: default_color({ value: "rgb(250,232,255)" }),
    fuchsia_99: default_color({ value: "rgb(253,244,255)" }),

    pink: default_color({ value: "rgb(219,39,119)" }),
    pink_10: default_color({ value: "rgb(80,7,36)" }),
    pink_20: default_color({ value: "rgb(131,24,67)" }),
    pink_30: default_color({ value: "rgb(157,23,77)" }),
    pink_40: default_color({ value: "rgb(190,24,93)" }),
    pink_50: default_color({ value: "rgb(219,39,119)" }),
    pink_60: default_color({ value: "rgb(236,72,153)" }),
    pink_70: default_color({ value: "rgb(244,114,182)" }),
    pink_80: default_color({ value: "rgb(249,168,212)" }),
    pink_90: default_color({ value: "rgb(251,207,232)" }),
    pink_95: default_color({ value: "rgb(252,231,243)" }),
    pink_99: default_color({ value: "rgb(253,242,248)" }),

    rose: default_color({ value: "rgb(225,29,72)" }),
    rose_10: default_color({ value: "rgb(76,5,25)" }),
    rose_20: default_color({ value: "rgb(136,19,55)" }),
    rose_30: default_color({ value: "rgb(159,18,57)" }),
    rose_40: default_color({ value: "rgb(190,18,60)" }),
    rose_50: default_color({ value: "rgb(225,29,72)" }),
    rose_60: default_color({ value: "rgb(244,63,94)" }),
    rose_70: default_color({ value: "rgb(251,113,133)" }),
    rose_80: default_color({ value: "rgb(253,164,175)" }),
    rose_90: default_color({ value: "rgb(254,205,211)" }),
    rose_95: default_color({ value: "rgb(255,228,230)" }),
    rose_99: default_color({ value: "rgb(255,241,242)" }),

    slate: default_color({ value: "rgb(71,85,105)" }),
    slate_10: default_color({ value: "rgb(2,6,23)" }),
    slate_20: default_color({ value: "rgb(15,23,42)" }),
    slate_30: default_color({ value: "rgb(30,41,59)" }),
    slate_40: default_color({ value: "rgb(51,65,85)" }),
    slate_50: default_color({ value: "rgb(71,85,105)" }),
    slate_60: default_color({ value: "rgb(100,116,139)" }),
    slate_70: default_color({ value: "rgb(148,163,184)" }),
    slate_80: default_color({ value: "rgb(203,213,225)" }),
    slate_90: default_color({ value: "rgb(226,232,240)" }),
    slate_95: default_color({ value: "rgb(241,245,249)" }),
    slate_99: default_color({ value: "rgb(248,250,252)" }),

    gray: default_color({ value: "rgb(75,85,99)" }),
    gray_10: default_color({ value: "rgb(3,7,18)" }),
    gray_20: default_color({ value: "rgb(17,24,39)" }),
    gray_30: default_color({ value: "rgb(31,41,55)" }),
    gray_40: default_color({ value: "rgb(55,65,82)" }),
    gray_50: default_color({ value: "rgb(75,85,99)" }),
    gray_60: default_color({ value: "rgb(107,114,128)" }),
    gray_70: default_color({ value: "rgb(156,163,175)" }),
    gray_80: default_color({ value: "rgb(209,213,219)" }),
    gray_90: default_color({ value: "rgb(229,231,235)" }),
    gray_95: default_color({ value: "rgb(243,244,246)" }),
    gray_99: default_color({ value: "rgb(249,250,251)" }),

    zinc: default_color({ value: "rgb(82,82,91)" }),
    zinc_10: default_color({ value: "rgb(9,9,11)" }),
    zinc_20: default_color({ value: "rgb(24,24,27)" }),
    zinc_30: default_color({ value: "rgb(39,39,42)" }),
    zinc_40: default_color({ value: "rgb(63,63,70)" }),
    zinc_50: default_color({ value: "rgb(82,82,91)" }),
    zinc_60: default_color({ value: "rgb(113,113,122)" }),
    zinc_70: default_color({ value: "rgb(161,161,170)" }),
    zinc_80: default_color({ value: "rgb(212,212,216)" }),
    zinc_90: default_color({ value: "rgb(228,228,231)" }),
    zinc_95: default_color({ value: "rgb(244,244,245)" }),
    zinc_99: default_color({ value: "rgb(250,250,250)" }),

    stone: default_color({ value: "rgb(87,83,78)" }),
    stone_10: default_color({ value: "rgb(12,10,9)" }),
    stone_20: default_color({ value: "rgb(28,25,23)" }),
    stone_30: default_color({ value: "rgb(41,37,36)" }),
    stone_40: default_color({ value: "rgb(68,64,60)" }),
    stone_50: default_color({ value: "rgb(87,83,78)" }),
    stone_60: default_color({ value: "rgb(120,113,108)" }),
    stone_70: default_color({ value: "rgb(168,162,158)" }),
    stone_80: default_color({ value: "rgb(214,211,209)" }),
    stone_90: default_color({ value: "rgb(231,229,228)" }),
    stone_95: default_color({ value: "rgb(245,245,244)" }),
    stone_99: default_color({ value: "rgb(250,250,249)" }),

    neutral: default_color({ value: "rgb(112,112,112)" }),
    neutral_0: default_color({ value: "rgb(0,0,0)" }),
    neutral_10: default_color({ value: "rgb(37,37,37)" }),
    neutral_20: default_color({ value: "rgb(52,52,52)" }),
    neutral_30: default_color({ value: "rgb(69,69,69)" }),
    neutral_40: default_color({ value: "rgb(95,95,95)" }),
    neutral_50: default_color({ value: "rgb(112,112,112)" }),
    neutral_60: default_color({ value: "rgb(142,142,142)" }),
    neutral_70: default_color({ value: "rgb(181,181,181)" }),
    neutral_80: default_color({ value: "rgb(222,222,222)" }),
    neutral_90: default_color({ value: "rgb(235,235,235)" }),
    neutral_95: default_color({ value: "rgb(247,247,247)" }),
    neutral_99: default_color({ value: "rgb(250,250,250)" }),
    neutral_100: default_color({ value: "rgb(255,255,255)" }),

    black: default_color({ value: "rgb(0,0,0)" }),
    white: default_color({ value: "rgb(255,255,255)" }),
  } as Record<string, ReturnType<typeof default_color>>,
  component: {
    $default: default_component(),
  } as Record<string, ReturnType<typeof default_component>>,
  theme: {
    $default: default_theme(),
  } as Record<string, ReturnType<typeof default_theme>>,
  style: {
    $default: default_style(),
    main: default_style({
      $name: "main",
      font_family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, system-ui, sans-serif, "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol"`,
      font_size: "1.25rem",
      line_height: "1.5",
      color: "white",
      "@screen_size(sm)": { font_size: "1.125rem" },
    }),
    row: default_style({
      $name: "row",
      display: "flex",
      flex_direction: "row",
    }),
    column: default_style({
      $name: "column",
      display: "flex",
      flex_direction: "column",
    }),
    stack: default_style({
      $name: "stack",
      "> *": {
        position: "absolute",
        inset: "0",
      },
    }),
    overlay: default_style({
      $name: "overlay",
      position: "absolute",
      inset: "0",
    }),
    text: default_style({
      $name: "text",
      display: "block",
      pointer_events: "auto",
      user_select: "none",
      text_wrap: "wrap",
      white_space: "pre-line",
      ">> *": {
        display: "inline",
      },
    }),
    stroke: default_style({
      $name: "stroke",
      display: "block",
      pointer_events: "none",
      user_select: "none",
      text_wrap: "wrap",
      position: "absolute",
      inset: "0",
      text_stroke: "1",
      color: "black",
      white_space: "pre-line",
      ">> *": {
        display: "inline",
      },
    }),
    text_line: default_style({
      $name: "text_line",
      display: "block",
      text_wrap: "wrap",
    }),
    text_word: default_style({
      $name: "text_word",
      display: "inline-block",
    }),
    text_space: default_style({
      $name: "text_space",
      display: "inline",
    }),
    text_letter: default_style({
      $name: "text_letter",
    }),
    image: default_style({
      $name: "image",
      display: "block",
      pointer_events: "auto",
      position: "absolute",
      inset: 0,
      isolation: "isolate",
      will_change: "transform",
      container_type: "size",
      container_name: "image",
      "> *": {
        position: "absolute",
        inset: "0",
        background_position: "center",
        background_repeat: "no-repeat",
        background_size: "auto 100%",
        will_change: "transform",
        min_width: "100%",
        width: "fit-content",
        translate: "calc(0.5 * (100cqw - 100%)) 0",
      },
    }),
    object: default_style({
      $name: "object",
      height: "100%",
      object_fit: "cover",
      visibility: "hidden",
    }),
    mask: default_style({
      $name: "mask",
      display: "block",
      pointer_events: "auto",
      position: "absolute",
      inset: 0,
      isolation: "isolate",
      will_change: "transform",
      "> *": {
        mix_blend_mode: "plus-lighter",
        position: "absolute",
        inset: "0",
        mask_position: "center",
        mask_repeat: "no-repeat",
        mask_size: "auto 100%",
        will_change: "transform",
      },
    }),
    loading_bar: default_style({
      $name: "loading_bar",
      z_index: "1000",
      position: "relative",
      width: "100%",
      height: "4px",
    }),
    loading_fill: default_style({
      $name: "loading_fill",
      width: "100%",
      height: "100%",
      background_color: "cyan50",
      transform: "scaleX(var(--loading_progress))",
      transform_origin: "left",
    }),
    screen: default_style({
      $name: "screen",
      position: "absolute",
      inset: "0",
      pointer_events: "none",
      ">> *": {
        pointer_events: "none",
      },
    }),
    stage: default_style({
      $name: "stage",
      position: "absolute",
      inset: "0",
      display: "flex",
      flex_direction: "column",
    }),
    backdrop: default_style({
      $name: "backdrop",
      position: "absolute",
      inset: "0",
      background_position: "center",
      background_size: "cover",
    }),
    portrait: default_style({
      $name: "portrait",
      position: "absolute",
      top: "10%",
      right: "0",
      bottom: "0",
      left: "0",
      display: "flex",
      flex_direction: "column",
      background_size: "auto 100%",
      background_position: "center",
      "> image >> *": {
        mix_blend_mode: "plus-lighter",
      },
    }),
    choices: default_style({
      $name: "choices",
      position: "relative",
      flex: "1",
      display: "flex",
      flex_direction: "column",
      align_items: "center",
      justify_content: "center",
      width: "100%",
      gap: "8px",
      margin_bottom: "100px",
      "@screen_size(sm)": { margin_bottom: "120px" },
    }),
    choice: default_style({
      $name: "choice",
      display: "flex",
      flex_direction: "row",
      width: "90%",
      max_width: "800px",
      background_color: "rgb(0 0 0 / 65%)",
      padding: "8px",
      border_radius: "8px",
      border: "1px solid",
      text_align: "center",
      align_items: "center",
      justify_content: "center",
      cursor: "pointer",
      "@hovered": {
        background_color: "black",
        transition: "all 0.15s linear",
      },
    }),
    textbox: default_style({
      $name: "textbox",
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      display: "flex",
      flex_direction: "column",
      align_items: "center",
      color: "white",
      flex: 1,
    }),
    textbox_background: default_style({
      $name: "textbox_background",
      position: "absolute",
      inset: "0",
      background_image:
        "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 25%, rgba(0, 0, 0, 1) 100%)",
    }),
    textbox_content: default_style({
      $name: "textbox_content",
      position: "relative",
      flex: "1",
      display: "flex",
      flex_direction: "column",
      max_width: "800px",
      width: "100%",
      margin: "0 auto",
      min_height: "200px",
      padding: "16px 32px",
      "@screen_size(sm)": {
        min_height: "240px",
        padding: "16px",
      },
    }),
    character_info: default_style({
      $name: "character_info",
      display: "flex",
      flex_direction: "row",
      justify_content: "center",
      align_items: "flex-end",
      gap: "8px",
      line_height: "1",
      font_size: "1.875rem",
      "@screen_size(sm)": { font_size: "1.5rem" },
    }),
    character_name: default_style({
      $name: "character_name",
      padding_bottom: "8px",
      font_weight: "600px",
    }),
    character_parenthetical: default_style({
      $name: "character_parenthetical",
      padding_bottom: "8px",
      font_weight: "400px",
      font_size: "1rem",
      "@screen_size(sm)": { font_size: "0.875rem" },
    }),
    title: default_style({
      $name: "title",
      position: "absolute",
      inset: "0",
      padding_left: "40px",
      padding_right: "40px",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
      font_weight: "bold",
    }),
    heading: default_style({
      $name: "heading",
      position: "absolute",
      inset: "0",
      padding_left: "40px",
      padding_right: "40px",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
      font_weight: "bold",
    }),
    transitional: default_style({
      $name: "transitional",
      position: "absolute",
      inset: "0",
      padding_left: "40px",
      padding_right: "40px",
      padding_bottom: "24px",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "flex-end",
      text_align: "right",
      width: "100%",
    }),
    dialogue: default_style({
      $name: "dialogue",
      margin: "0 auto",
      width: "68%",
      "@screen_size(sm)": { width: "80%" },
    }),
    action: default_style({
      $name: "action",
      position: "absolute",
      inset: "0",
      padding_left: "40px",
      padding_right: "40px",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
    }),
    continue_indicator: default_style({
      $name: "continue_indicator",
      opacity: "0",
      line_height: "1",
      width: "16px",
      height: "16px",
      position: "absolute",
      right: "16px",
      bottom: "16px",
      font_size: "16px",
      transition: `opacity 0.25s linear`,
      animation: "0.5s infinite bounce",
      animation_play_state: "paused",
    }),
  } as Record<string, ReturnType<typeof default_style>>,
  screen: {
    $default: default_screen(),
    loading: default_screen({
      $name: "loading",
      loading_bar: {
        loading_fill: {},
      },
    }),
    main: default_screen({
      $name: "main",
      stage: {
        animation: {},
        backdrop: {
          image: "transparent",
        },
        portrait: {
          image: {},
        },
      },
      choices: {
        "choice 0": {
          text: {},
        },
        "choice 1": {
          text: {},
        },
        "choice 2": {
          text: {},
        },
        "choice 3": {
          text: {},
        },
        "choice 4": {
          text: {},
        },
        "choice 5": {
          text: {},
        },
      },
      textbox: {
        textbox_background: {},
        textbox_content: {
          character_info: {
            character_name: {
              stroke: {},
              text: {},
            },
            character_parenthetical: {
              stroke: {},
              text: {},
            },
          },
          title: {
            stroke: {},
            text: {},
          },
          heading: {
            stroke: {},
            text: {},
          },
          transitional: {
            stroke: {},
            text: {},
          },
          dialogue: {
            stroke: {},
            text: {},
          },
          action: {
            stroke: {},
            text: {},
          },
        },
        continue_indicator: {
          text: "▼",
        },
      },
      screen: {
        animation: {},
      },
    }),
  } as Record<string, ReturnType<typeof default_screen>>,
  layer: {
    $default: {},
    self: {},
    instance: {},
    object: {},
  } as Record<string, {}>,
  animation: {
    $default: default_animation(),
    show: default_animation({
      $name: "show",
      keyframes: [{ opacity: "1" }],
      timing: {
        duration: 0,
        easing: "linear",
        fill: "both",
      },
    }),
    hide: default_animation({
      $name: "hide",
      keyframes: [{ opacity: "0" }],
      timing: {
        duration: 0,
        easing: "linear",
        fill: "both",
      },
    }),
    align_left: default_animation({
      $name: "align_left",
      target: { $type: "layer", $name: "instance" },
      keyframes: [{ translate: "calc(0 * (100cqw - 100%)) 0" }],
      timing: {
        duration: 0,
        easing: "ease-in-out",
        fill: "both",
      },
    }),
    align_center: default_animation({
      $name: "align_center",
      target: { $type: "layer", $name: "instance" },
      keyframes: [{ translate: "calc(0.5 * (100cqw - 100%)) 0" }],
      timing: {
        duration: 0,
        easing: "ease-in-out",
        fill: "both",
      },
    }),
    align_right: default_animation({
      $name: "align_right",
      target: { $type: "layer", $name: "instance" },
      keyframes: [{ translate: "calc(1 * (100cqw - 100%)) 0" }],
      timing: {
        duration: 0,
        easing: "ease-in-out",
        fill: "both",
      },
    }),
    spin: default_animation({
      $name: "spin",
      keyframes: [{ transform: "rotate(360deg)" }],
      timing: {
        easing: "linear",
        iterations: "infinite",
        fill: "none",
      },
    }),
    ping: default_animation({
      $name: "ping",
      keyframes: [
        {
          offset: 0.75,
          transform: "scale(2)",
          opacity: "0",
        },
        {
          offset: 1.0,
          transform: "scale(2)",
          opacity: "0",
        },
      ],
      timing: {},
    }),
    bounce: default_animation({
      $name: "bounce",
      keyframes: [
        {
          transform: "translateY(-50%)",
          easing: "cubic-bezier(0.8,0,1,1)",
        },
        {
          transform: "none",
          easing: "cubic-bezier(0,0,0.2,1)",
        },
        {
          transform: "translateY(-50%)",
          easing: "cubic-bezier(0.8,0,1,1)",
        },
      ],
      timing: {
        iterations: "infinite",
        fill: "none",
      },
    }),
    wave: default_animation({
      $name: "wave",
      keyframes: [
        {
          transform: "translateY(0)",
        },
        {
          transform: "translateY(-15%)",
        },
        {
          transform: "translateY(0)",
        },
      ],
      timing: {
        duration: "750ms",
        easing: "ease-in-out",
      },
    }),
    wavy: default_animation({
      $name: "wavy",
      keyframes: [
        {
          transform: "translateY(0)",
        },
        {
          transform: "translateY(-15%)",
        },
        {
          transform: "translateY(0)",
        },
      ],
      timing: {
        duration: "750ms",
        easing: "ease-in-out",
        iterations: "infinite",
        fill: "none",
      },
    }),
    shaky: default_animation({
      $name: "shaky",
      keyframes: [
        {
          left: "calc(1em / 60)",
          top: "calc(1em / 60)",
        },
        {
          left: "calc(-1em / 60)",
          top: "calc(-2em / 60)",
        },
        {
          left: "calc(-2em / 60)",
          top: "calc(0em / 60)",
        },
        {
          left: "calc(2em / 60)",
          top: "calc(2em / 60)",
        },
        {
          left: "calc(1em / 60)",
          top: "calc(-1em / 60)",
        },
        {
          left: "calc(-1em / 60)",
          top: "calc(2em / 60)",
        },
        {
          left: "calc(-2em / 60)",
          top: "calc(1em / 60)",
        },
        {
          left: "calc(2em / 60)",
          top: "calc(1em / 60)",
        },
        {
          left: "calc(-1em / 60)",
          top: "calc(-1em / 60)",
        },
        {
          left: "calc(1em / 60)",
          top: "calc(2em / 60)",
        },
        {
          left: "calc(1em / 60)",
          top: "calc(-2em / 60)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        iterations: "infinite",
        fill: "none",
      },
    }),
    shake: default_animation({
      $name: "shake",
      keyframes: [
        {
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          transform: "translate(-0.2vh, -0.4vh)",
        },
        {
          transform: "translate(-0.6vh, 0vh)",
        },
        {
          transform: "translate(0vh, 0.4vh)",
        },
        {
          transform: "translate(0.2vh, -0.2vh)",
        },
        {
          transform: "translate(-0.2vh, 0.4vh)",
        },
        {
          transform: "translate(-0.6vh, 0.2vh)",
        },
        {
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          transform: "translate(-0.2vh, -0.2vh)",
        },
        {
          transform: "translate(0.4vh, 0.4vh)",
        },
        {
          transform: "translate(0.2vh, -0.4vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        fill: "none",
      },
    }),
    shaking: default_animation({
      $name: "shaking",
      keyframes: [
        {
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          transform: "translate(-0.2vh, -0.4vh)",
        },
        {
          transform: "translate(-0.6vh, 0vh)",
        },
        {
          transform: "translate(0vh, 0.4vh)",
        },
        {
          transform: "translate(0.2vh, -0.2vh)",
        },
        {
          transform: "translate(-0.2vh, 0.4vh)",
        },
        {
          transform: "translate(-0.6vh, 0.2vh)",
        },
        {
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          transform: "translate(-0.2vh, -0.2vh)",
        },
        {
          transform: "translate(0.4vh, 0.4vh)",
        },
        {
          transform: "translate(0.2vh, -0.4vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        iterations: "infinite",
      },
    }),
    shiver: default_animation({
      $name: "shiver",
      keyframes: [
        {
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          transform: "translate(-0.1vh, -0.2vh)",
        },
        {
          transform: "translate(-0.3vh, 0vh)",
        },
        {
          transform: "translate(0vh, 0.2vh)",
        },
        {
          transform: "translate(0.1vh, -0.1vh)",
        },
        {
          transform: "translate(-0.1vh, 0.2vh)",
        },
        {
          transform: "translate(-0.3vh, 0.1vh)",
        },
        {
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          transform: "translate(-0.1vh, -0.1vh)",
        },
        {
          transform: "translate(0.2vh, 0.2vh)",
        },
        {
          transform: "translate(0.1vh, -0.2vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        fill: "none",
      },
    }),
    shivering: default_animation({
      $name: "shivering",
      keyframes: [
        {
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          transform: "translate(-0.1vh, -0.2vh)",
        },
        {
          transform: "translate(-0.3vh, 0vh)",
        },
        {
          transform: "translate(0vh, 0.2vh)",
        },
        {
          transform: "translate(0.1vh, -0.1vh)",
        },
        {
          transform: "translate(-0.1vh, 0.2vh)",
        },
        {
          transform: "translate(-0.3vh, 0.1vh)",
        },
        {
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          transform: "translate(-0.1vh, -0.1vh)",
        },
        {
          transform: "translate(0.2vh, 0.2vh)",
        },
        {
          transform: "translate(0.1vh, -0.2vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        iterations: "infinite",
        fill: "none",
      },
    }),
    waitout: default_animation({
      $name: "waitout",
      keyframes: [
        {
          opacity: "0",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "step-end",
        fill: "both",
      },
    }),
    waitin: default_animation({
      $name: "waitin",
      keyframes: [
        {
          opacity: "1",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "step-end",
        fill: "both",
      },
    }),
    fadeout: default_animation({
      $name: "fadeout",
      keyframes: [
        {
          opacity: "0",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    fadein: default_animation({
      $name: "fadein",
      keyframes: [
        {
          opacity: "1",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    pulse: default_animation({
      $name: "pulse",
      keyframes: [
        {
          opacity: "0",
        },
        {
          opacity: "1",
        },
        {
          opacity: "0",
        },
      ],
      timing: {
        duration: "1s",
        easing: "linear",
        fill: "both",
      },
    }),
    blackout: default_animation({
      $name: "blackout",
      keyframes: [
        {
          background_color: "black",
          opacity: "0",
        },
        {
          background_color: "black",
          opacity: "1",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    blackin: default_animation({
      $name: "blackin",
      keyframes: [
        {
          background_color: "black",
          opacity: "1",
        },
        {
          background_color: "black",
          opacity: "0",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    blackpulse: default_animation({
      $name: "blackpulse",
      keyframes: [
        {
          background_color: "black",
          opacity: "0",
        },
        {
          background_color: "black",
          opacity: "1",
        },
        {
          background_color: "black",
          opacity: "0",
        },
      ],
      timing: {
        duration: "1s",
        easing: "linear",
        fill: "both",
      },
    }),
    whiteout: default_animation({
      $name: "whiteout",
      keyframes: [
        {
          background_color: "white",
          opacity: "0",
        },
        {
          background_color: "white",
          opacity: "1",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    whitein: default_animation({
      $name: "whitein",
      keyframes: [
        {
          background_color: "white",
          opacity: "1",
        },
        {
          background_color: "white",
          opacity: "0",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "both",
      },
    }),
    whitepulse: default_animation({
      $name: "whitepulse",
      keyframes: [
        {
          background_color: "white",
          opacity: "0",
        },
        {
          background_color: "white",
          opacity: "1",
        },
        {
          background_color: "white",
          opacity: "0",
        },
      ],
      timing: {
        duration: "1s",
        easing: "linear",
        fill: "both",
      },
    }),
  } as Record<string, ReturnType<typeof default_animation>>,
  transition: {
    $default: default_transition(),
    fade: default_transition({
      $name: "fade",
      on_hide: { $type: "animation", $name: "fadeout" },
      on_show: { $type: "animation", $name: "fadein" },
    }),
    screenfade: default_transition({
      $name: "screenfade",
      on_hide: { $type: "animation", $name: "waitout" },
      on_show: { $type: "animation", $name: "waitin" },
      screen: { $type: "animation", $name: "blackpulse" },
    }),
    screenflash: default_transition({
      $name: "screenflash",
      on_hide: { $type: "animation", $name: "waitout" },
      on_show: { $type: "animation", $name: "waitin" },
      screen: { $type: "animation", $name: "whitepulse" },
    }),
  } as Record<string, ReturnType<typeof default_transition>>,
  font: {
    $default: default_font(),
  } as Record<string, ReturnType<typeof default_font>>,
  shadow: {
    $default: default_shadow(),
    xs: default_shadow({
      $name: "xs",
      layers: [
        {
          x: 0,
          y: 1,
          blur: 2,
          spread: 0,
          color: "black",
          opacity: 0.3,
        },
        {
          x: 0,
          y: 1,
          blur: 3,
          spread: 1,
          color: "black",
          opacity: 0.15,
        },
      ],
    }),
    sm: default_shadow({
      $name: "sm",
      layers: [
        {
          x: 0,
          y: 1,
          blur: 2,
          spread: 0,
          color: "black",
          opacity: 0.3,
        },
        {
          x: 0,
          y: 2,
          blur: 6,
          spread: 2,
          color: "black",
          opacity: 0.15,
        },
      ],
    }),
    md: default_shadow({
      $name: "md",
      layers: [
        {
          x: 0,
          y: 1,
          blur: 3,
          spread: 0,
          color: "black",
          opacity: 0.3,
        },
        {
          x: 0,
          y: 4,
          blur: 8,
          spread: 3,
          color: "black",
          opacity: 0.15,
        },
      ],
    }),
    lg: default_shadow({
      $name: "lg",
      layers: [
        {
          x: 0,
          y: 2,
          blur: 3,
          spread: 0,
          color: "black",
          opacity: 0.3,
        },
        {
          x: 0,
          y: 6,
          blur: 10,
          spread: 4,
          color: "black",
          opacity: 0.15,
        },
      ],
    }),
    xl: default_shadow({
      $name: "xl",
      layers: [
        {
          x: 0,
          y: 4,
          blur: 4,
          spread: 0,
          color: "black",
          opacity: 0.3,
        },
        {
          x: 0,
          y: 8,
          blur: 12,
          spread: 6,
          color: "black",
          opacity: 0.15,
        },
      ],
    }),
  } as Record<string, ReturnType<typeof default_shadow>>,
  ease: {
    $default: default_ease(),
    none: default_ease({
      $name: "none",
      parameters: [0, 0, 0, 0],
    }),
    linear: default_ease({
      $name: "linear",
      parameters: [0, 0, 1, 1],
    }),
    spring: default_ease({
      $name: "spring",
      function: "linear",
      parameters: [
        "0",
        "0.009",
        "0.035 2.1%",
        "0.141",
        "0.281 6.7%",
        "0.723 12.9%",
        "0.938 16.7%",
        "1.017",
        "1.077",
        "1.121",
        "1.149 24.3%",
        "1.159",
        "1.163",
        "1.161",
        "1.154 29.9%",
        "1.129 32.8%",
        "1.051 39.6%",
        "1.017 43.1%",
        "0.991",
        "0.977 51%",
        "0.974 53.8%",
        "0.975 57.1%",
        "0.997 69.8%",
        "1.003 76.9%",
        "1.004 83.8%",
        "1",
      ],
    }),
    elastic: default_ease({
      $name: "elastic",
      function: "linear",
      parameters: [
        "0",
        "0.218 2.1%",
        "0.862 6.5%",
        "1.114",
        "1.296 10.7%",
        "1.346",
        "1.37 12.9%",
        "1.373",
        "1.364 14.5%",
        "1.315 16.2%",
        "1.032 21.8%",
        "0.941 24%",
        "0.891 25.9%",
        "0.877",
        "0.869 27.8%",
        "0.87",
        "0.882 30.7%",
        "0.907 32.4%",
        "0.981 36.4%",
        "1.012 38.3%",
        "1.036",
        "1.046 42.7% 44.1%",
        "1.042 45.7%",
        "0.996 53.3%",
        "0.988",
        "0.984 57.5%",
        "0.985 60.7%",
        "1.001 68.1%",
        "1.006 72.2%",
        "0.998 86.7%",
        "1",
      ],
    }),
    bounce: default_ease({
      $name: "bounce",
      function: "linear",
      parameters: [
        "0",
        "0.004",
        "0.016",
        "0.035",
        "0.063",
        "0.098",
        "0.141 13.6%",
        "0.25",
        "0.391",
        "0.563",
        "0.765",
        "1",
        "0.891 40.9%",
        "0.848",
        "0.813",
        "0.785",
        "0.766",
        "0.754",
        "0.75",
        "0.754",
        "0.766",
        "0.785",
        "0.813",
        "0.848",
        "0.891 68.2%",
        "1 72.7%",
        "0.973",
        "0.953",
        "0.941",
        "0.938",
        "0.941",
        "0.953",
        "0.973",
        "1",
        "0.988",
        "0.984",
        "0.988",
        "1",
      ],
    }),
    in_sine: default_ease({
      $name: "in_sine",
      parameters: [0.12, 0, 0.39, 0],
    }),
    out_sine: default_ease({
      $name: "out_sine",
      parameters: [0.61, 1, 0.88, 1],
    }),
    in_out_sine: default_ease({
      $name: "in_out_sine",
      parameters: [0.37, 0, 0.63, 1],
    }),
    in_quad: default_ease({
      $name: "in_quad",
      parameters: [0.11, 0, 0.5, 0],
    }),
    out_quad: default_ease({
      $name: "out_quad",
      parameters: [0.5, 1, 0.89, 1],
    }),
    in_out_quad: default_ease({
      $name: "in_out_quad",
      parameters: [0.45, 0, 0.55, 1],
    }),
    in_cubic: default_ease({
      $name: "in_cubic",
      parameters: [0.32, 0, 0.67, 0],
    }),
    out_cubic: default_ease({
      $name: "out_cubic",
      parameters: [0.33, 1, 0.68, 1],
    }),
    in_out_cubic: default_ease({
      $name: "in_out_cubic",
      parameters: [0.65, 0, 0.35, 1],
    }),
    in_quart: default_ease({
      $name: "in_quart",
      parameters: [0.5, 0, 0.75, 0],
    }),
    out_quart: default_ease({
      $name: "out_quart",
      parameters: [0.25, 1, 0.5, 1],
    }),
    in_out_quart: default_ease({
      $name: "in_out_quart",
      parameters: [0.76, 0, 0.24, 1],
    }),
    in_quint: default_ease({
      $name: "in_quint",
      parameters: [0.64, 0, 0.78, 0],
    }),
    out_quint: default_ease({
      $name: "out_quint",
      parameters: [0.22, 1, 0.36, 1],
    }),
    in_out_quint: default_ease({
      $name: "in_out_quint",
      parameters: [0.83, 0, 0.17, 1],
    }),
    in_expo: default_ease({
      $name: "in_expo",
      parameters: [0.7, 0, 0.84, 0],
    }),
    out_expo: default_ease({
      $name: "out_expo",
      parameters: [0.16, 1, 0.3, 1],
    }),
    in_out_expo: default_ease({
      $name: "in_out_expo",
      parameters: [0.87, 0, 0.13, 1],
    }),
    in_circ: default_ease({
      $name: "in_circ",
      parameters: [0.55, 0, 1, 0.45],
    }),
    out_circ: default_ease({
      $name: "out_circ",
      parameters: [0, 0.55, 0.45, 1],
    }),
    in_out_circ: default_ease({
      $name: "in_out_circ",
      parameters: [0.85, 0, 0.15, 1],
    }),
    in_back: default_ease({
      $name: "in_back",
      parameters: [0.36, 0, 0.66, -0.56],
    }),
    out_back: default_ease({
      $name: "out_back",
      parameters: [0.34, 1.56, 0.64, 1],
    }),
    in_out_back: default_ease({
      $name: "in_out_back",
      parameters: [0.68, -0.6, 0.32, 1.6],
    }),
  } as Record<string, ReturnType<typeof default_ease>>,
  gradient: {
    $default: default_gradient(),
  } as Record<string, ReturnType<typeof default_gradient>>,
  graphic: {
    $default: default_graphic(),
  } as Record<string, ReturnType<typeof default_graphic>>,
});

export interface UIBuiltins extends ReturnType<typeof uiBuiltinDefinitions> {}
