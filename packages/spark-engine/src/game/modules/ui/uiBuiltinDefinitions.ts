import { default_animation } from "./constructors/default_animation";
import { default_ease } from "./constructors/default_ease";
import { default_filtered_image } from "./constructors/default_filtered_image";
import { default_font } from "./constructors/default_font";
import { default_gradient } from "./constructors/default_gradient";
import { default_graphic } from "./constructors/default_graphic";
import { default_image } from "./constructors/default_image";
import { default_layered_image } from "./constructors/default_layered_image";
import { default_layout } from "./constructors/default_layout";
import { default_shadow } from "./constructors/default_shadow";
import { default_style } from "./constructors/default_style";
import { default_transition } from "./constructors/default_transition";

export const uiBuiltinDefinitions = () => ({
  config: {
    ui: {
      styles_element_name: "styles",
      layouts_element_name: "layouts",
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
      "@screen(sm)": { font_size: "1.125rem" },
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
      "*": {
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
      "*": {
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
      "*": {
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
      "image *": {
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
      "> *": {
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
      },
      "> *:hover": {
        background_color: "black",
        transition: "all 0.15s linear",
      },
      "@screen(sm)": { margin_bottom: "120px" },
    }),
    choice_0: default_style({
      $name: "choice_0",
    }),
    choice_1: default_style({
      $name: "choice_1",
    }),
    choice_2: default_style({
      $name: "choice_2",
    }),
    choice_3: default_style({
      $name: "choice_3",
    }),
    choice_4: default_style({
      $name: "choice_4",
    }),
    choice_5: default_style({
      $name: "choice_5",
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
      "@screen(sm)": {
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
      "@screen(sm)": { font_size: "1.5rem" },
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
      "@screen(sm)": { font_size: "0.875rem" },
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
      "@screen(sm)": { width: "80%" },
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
  layout: {
    $default: default_layout(),
    loading: default_layout({
      $name: "loading",
      loading_bar: {
        loading_fill: {},
      },
    }),
    main: default_layout({
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
        choice_0: {
          text: {},
        },
        choice_1: {
          text: {},
        },
        choice_2: {
          text: {},
        },
        choice_3: {
          text: {},
        },
        choice_4: {
          text: {},
        },
        choice_5: {
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
  } as Record<string, ReturnType<typeof default_layout>>,
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
