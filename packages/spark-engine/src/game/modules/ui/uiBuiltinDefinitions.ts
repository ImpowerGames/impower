import { default_animation } from "./constructors/default_animation";
import { default_ease } from "./constructors/default_ease";
import { default_filtered_image } from "./constructors/default_filtered_image";
import { default_font } from "./constructors/default_font";
import { default_gradient } from "./constructors/default_gradient";
import { default_graphic } from "./constructors/default_graphic";
import { default_image } from "./constructors/default_image";
import { default_layered_image } from "./constructors/default_layered_image";
import { default_shadow } from "./constructors/default_shadow";
import { default_style } from "./constructors/default_style";
import { default_transition } from "./constructors/default_transition";
import { default_ui } from "./constructors/default_ui";

export const uiBuiltinDefinitions = () => ({
  config: {
    ui: {
      style_element_name: "style",
      ui_element_name: "ui",
      breakpoints: {
        xs: 400,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
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
    text: default_style({
      $name: "text",
      display: "block",
      pointer_events: "auto",
      text_wrap: "balance",
      white_space: "pre-line",
      "*": {
        display: "inline",
      },
    }),
    stroke: default_style({
      $name: "stroke",
      display: "block",
      pointer_events: "none",
      position: "absolute",
      inset: "0",
      text_stroke: "2",
      color: "black",
      white_space: "pre-line",
      "*": {
        display: "inline",
      },
    }),
    text_line: default_style({
      $name: "text_line",
      display: "block",
      text_wrap: "balance",
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
      "*": {
        mix_blend_mode: "plus-lighter",
        position: "absolute",
        inset: "0",
        background_position: "center",
        background_repeat: "no-repeat",
        background_size: "auto 100%",
        will_change: "transform",
      },
    }),
    mask: default_style({
      $name: "mask",
      display: "block",
      pointer_events: "auto",
      position: "absolute",
      inset: 0,
      isolation: "isolate",
      will_change: "transform",
      "*": {
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
    background: default_style({
      $name: "background",
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
      font_size: "1.125rem",
      color: "white",
      "> *": {
        display: "flex",
        flex_direction: "row",
        width: "90%",
        max_width: "800px",
        background_color: "rgb(0 0 0 / 65%)",
        padding: "8px",
        border_radius: "8px",
        opacity: "0",
        text_align: "center",
        align_items: "center",
        justify_content: "center",
        cursor: "pointer",
      },
      "> *:hover": {
        background_color: "black",
        transition: "all 0.15s linear",
      },
      "@screen(sm)": { margin_bottom: "120px", font_size: "1rem" },
    }),
    choice_0: default_style({
      $name: "choice_0",
      display: "flex",
      flex_direction: "row",
    }),
    choice_1: default_style({
      $name: "choice_1",
      display: "flex",
      flex_direction: "row",
    }),
    choice_2: default_style({
      $name: "choice_2",
      display: "flex",
      flex_direction: "row",
    }),
    choice_3: default_style({
      $name: "choice_3",
      display: "flex",
      flex_direction: "row",
    }),
    choice_4: default_style({
      $name: "choice_4",
      display: "flex",
      flex_direction: "row",
    }),
    choice_5: default_style({
      $name: "choice_5",
      display: "flex",
      flex_direction: "row",
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
      font_size: "1.25rem",
      min_height: "200px",
      padding: "16px 32px",
      "@screen(sm)": {
        font_size: "1.125rem",
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
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
    }),
    transition: default_style({
      $name: "transition",
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
    scene: default_style({
      $name: "scene",
      position: "absolute",
      inset: "0",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
      font_weight: "bold",
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
      transition: `opacity 0.25s linear`,
      animation: "0.5s infinite bounce",
      animation_play_state: "paused",
    }),
  } as Record<string, ReturnType<typeof default_style>>,
  ui: {
    $default: default_ui(),
    loading: default_ui({
      $name: "loading",
      loading_bar: {
        loading_fill: {},
      },
    }),
    stage: default_ui({
      $name: "stage",
      background: {
        backdrop: {
          image: {},
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
          dialogue: {
            stroke: {},
            text: {},
          },
          action: {
            stroke: {},
            text: {},
          },
          scene: {
            stroke: {},
            text: {},
          },
          transition: {
            stroke: {},
            text: {},
          },
        },
        continue_indicator: {
          text: "▼",
        },
      },
      screen: {},
    }),
  } as Record<string, ReturnType<typeof default_ui>>,
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
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    }),
    linear: default_ease({
      $name: "linear",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    }),
    sine_in: default_ease({
      $name: "sine_in",
      x1: 0.12,
      y1: 0,
      x2: 0.39,
      y2: 0,
    }),
    sine_out: default_ease({
      $name: "sine_out",
      x1: 0.61,
      y1: 1,
      x2: 0.88,
      y2: 1,
    }),
    sine_in_out: default_ease({
      $name: "sine_in_out",
      x1: 0.37,
      y1: 0,
      x2: 0.63,
      y2: 1,
    }),
    quad_in: default_ease({
      $name: "quad_in",
      x1: 0.11,
      y1: 0,
      x2: 0.5,
      y2: 0,
    }),
    quad_out: default_ease({
      $name: "quad_out",
      x1: 0.5,
      y1: 1,
      x2: 0.89,
      y2: 1,
    }),
    quad_in_out: default_ease({
      $name: "quad_in_out",
      x1: 0.45,
      y1: 0,
      x2: 0.55,
      y2: 1,
    }),
    cubic_in: default_ease({
      $name: "cubic_in",
      x1: 0.32,
      y1: 0,
      x2: 0.67,
      y2: 0,
    }),
    cubic_out: default_ease({
      $name: "cubic_out",
      x1: 0.33,
      y1: 1,
      x2: 0.68,
      y2: 1,
    }),
    cubic_in_out: default_ease({
      $name: "cubic_in_out",
      x1: 0.65,
      y1: 0,
      x2: 0.35,
      y2: 1,
    }),
    quart_in: default_ease({
      $name: "quart_in",
      x1: 0.5,
      y1: 0,
      x2: 0.75,
      y2: 0,
    }),
    quart_out: default_ease({
      $name: "quart_out",
      x1: 0.25,
      y1: 1,
      x2: 0.5,
      y2: 1,
    }),
    quart_in_out: default_ease({
      $name: "quart_in_out",
      x1: 0.76,
      y1: 0,
      x2: 0.24,
      y2: 1,
    }),
    quint_in: default_ease({
      $name: "quint_in",
      x1: 0.64,
      y1: 0,
      x2: 0.78,
      y2: 0,
    }),
    quint_out: default_ease({
      $name: "quint_out",
      x1: 0.22,
      y1: 1,
      x2: 0.36,
      y2: 1,
    }),
    quint_in_out: default_ease({
      $name: "quint_in_out",
      x1: 0.83,
      y1: 0,
      x2: 0.17,
      y2: 1,
    }),
    expo_in: default_ease({
      $name: "expo_in",
      x1: 0.7,
      y1: 0,
      x2: 0.84,
      y2: 0,
    }),
    expo_out: default_ease({
      $name: "expo_out",
      x1: 0.16,
      y1: 1,
      x2: 0.3,
      y2: 1,
    }),
    expo_in_out: default_ease({
      $name: "expo_in_out",
      x1: 0.87,
      y1: 0,
      x2: 0.13,
      y2: 1,
    }),
    circ_in: default_ease({
      $name: "circ_in",
      x1: 0.55,
      y1: 0,
      x2: 1,
      y2: 0.45,
    }),
    circ_out: default_ease({
      $name: "circ_out",
      x1: 0,
      y1: 0.55,
      x2: 0.45,
      y2: 1,
    }),
    circ_in_out: default_ease({
      $name: "circ_in_out",
      x1: 0.85,
      y1: 0,
      x2: 0.15,
      y2: 1,
    }),
    back_in: default_ease({
      $name: "back_in",
      x1: 0.36,
      y1: 0,
      x2: 0.66,
      y2: -0.56,
    }),
    back_out: default_ease({
      $name: "back_out",
      x1: 0.34,
      y1: 1.56,
      x2: 0.64,
      y2: 1,
    }),
    back_in_out: default_ease({
      $name: "back_in_out",
      x1: 0.68,
      y1: -0.6,
      x2: 0.32,
      y2: 1.6,
    }),
  } as Record<string, ReturnType<typeof default_ease>>,
  gradient: {
    $default: default_gradient(),
  } as Record<string, ReturnType<typeof default_gradient>>,
  graphic: {
    $default: default_graphic(),
  } as Record<string, ReturnType<typeof default_graphic>>,
});

export type UIBuiltins = ReturnType<typeof uiBuiltinDefinitions>;
