import { _animation } from "./constructors/_animation";
import { _ease } from "./constructors/_ease";
import { _font } from "./constructors/_font";
import { _gradient } from "./constructors/_gradient";
import { _graphic } from "./constructors/_graphic";
import { _image } from "./constructors/_image";
import { _imageFilter } from "./constructors/_imageFilter";
import { _imageGroup } from "./constructors/_imageGroup";
import { _shadow } from "./constructors/_shadow";
import { _style } from "./constructors/_style";
import { _ui } from "./constructors/_ui";

export const uiBuiltins = () => ({
  config: {
    ui: {
      ignore: ["default", "text", "image"],
      style_element_name: "game-style",
      ui_element_name: "game-ui",
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
    default: _image({
      $name: "default",
    }),
  } as Record<string, ReturnType<typeof _image>>,
  image_group: {
    default: _imageGroup({
      $name: "default",
    }),
  } as Record<string, ReturnType<typeof _imageGroup>>,
  image_filter: {
    default: _imageFilter({
      $name: "default",
    }),
  } as Record<string, ReturnType<typeof _imageFilter>>,
  style: {
    default: _style({
      $name: "default",
      xs: {},
      sm: {},
      md: {},
      lg: {},
      xl: {},
      hovered: {},
      pressed: {},
      focused: {},
      checked: {},
      disabled: {},
    }),
    all: _style({
      $name: "all",
      target: "*, *::before, *::after",
      box_sizing: "border-box",
    }),
    is_hidden: _style({
      $name: "is_hidden",
      target: "[hidden]",
      display: "none",
    }),
    text: _style({
      $name: "text",
      pointer_events: "auto",
      position: "relative",
      white_space: "pre-line",
      "*": {
        position: "relative",
      },
    }),
    image: _style({
      $name: "image",
      position: "absolute",
      pointer_events: "auto",
      inset: 0,
      "*": {
        position: "absolute",
        inset: "0",
        background_position: "center",
        background_repeat: "no-repeat",
        background_size: "auto 100%",
      },
    }),
    loading_bar: _style({
      $name: "loading_bar",
      z_index: 1000,
      position: "relative",
      width: "100%",
      height: 4,
    }),
    loading_fill: _style({
      $name: "loading_fill",
      width: "100%",
      height: "100%",
      background_color: "cyan50",
      transform: "scaleX(var(--loading_progress))",
      transform_origin: "left",
    }),
    screen: _style({
      $name: "screen",
      position: "absolute",
      inset: 0,
      pointer_events: "none",
    }),
    background: _style({
      $name: "background",
      position: "absolute",
      inset: 0,
      display: "flex",
      flex_direction: "column",
    }),
    backdrop: _style({
      $name: "backdrop",
      preserve_image: true,
      position: "absolute",
      inset: 0,
      background_position: "center",
      background_size: "cover",
    }),
    portrait: _style({
      $name: "portrait",
      position: "absolute",
      top: "10%",
      right: 0,
      bottom: 0,
      left: 0,
      display: "flex",
      flex_direction: "column",
      background_size: "auto 100%",
      background_position: "center",
    }),
    middle: _style({
      $name: "middle",
      position: "relative",
      flex: 1,
      display: "flex",
      flex_direction: "column",
      align_items: "center",
      justify_content: "center",
      font_size: "1.125rem",
      md: { font_size: "1.25rem" },
    }),
    choices: _style({
      $name: "choices",
      display: "flex",
      flex_direction: "column",
      align_items: "center",
      justify_content: "center",
      width: "100%",
      padding: 8,
    }),
    choice: _style({
      $name: "choice",
      display: "flex",
      flex: 1,
      background_color: "white",
      color: "black",
      padding: 8,
      margin: "8px 0",
      width: "90%",
      max_width: 800,
      text_align: "center",
      opacity: "0",
    }),
    choice_0: _style({
      $name: "choice_0",
      display: "flex",
    }),
    choice_1: _style({
      $name: "choice_1",
      display: "flex",
    }),
    choice_2: _style({
      $name: "choice_2",
      display: "flex",
    }),
    choice_3: _style({
      $name: "choice_3",
      display: "flex",
    }),
    choice_4: _style({
      $name: "choice_4",
      display: "flex",
    }),
    choice_5: _style({
      $name: "choice_5",
      display: "flex",
    }),
    bottom: _style({
      $name: "bottom",
      position: "relative",
      display: "flex",
      flex_direction: "column",
      align_content: "center",
      max_height: 224,
      height: "100%",
    }),
    textbox: _style({
      $name: "textbox",
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      display: "flex",
      flex_direction: "column",
      align_content: "center",
      max_width: 800,
      width: "100%",
      margin: "0 auto",
      color: "white",
      flex: 1,
      padding: 16,
      height: 240,
      md: { height: 200, padding_left: 32, padding_right: 32 },
    }),
    textbox_background: _style({
      $name: "textbox_background",
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      background_image:
        "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 25%, rgba(0, 0, 0, 1) 100%)",
      height: 280,
      md: { height: 240 },
    }),
    textbox_content: _style({
      $name: "textbox_content",
      position: "relative",
      flex: 1,
      display: "flex",
      flex_direction: "column",
      text_stroke: 2,
      font_size: "1.125rem",
      md: { font_size: "1.25rem" },
    }),
    character_info: _style({
      $name: "character_info",
      display: "flex",
      flex_direction: "row",
      justify_content: "center",
      align_items: "flex-end",
      gap: 8,
      line_height: 1,
      text_stroke: 3,
      font_size: "1.5rem",
      md: { font_size: "1.875rem" },
    }),
    character_name: _style({
      $name: "character_name",
      padding_bottom: 4,
      font_weight: 600,
    }),
    character_parenthetical: _style({
      $name: "character_parenthetical",
      padding_bottom: 4,
      font_weight: 400,
      font_size: "0.875rem",
      md: { font_size: "1rem" },
    }),
    dialogue: _style({
      $name: "dialogue",
      width: "80%",
      margin: "0 auto",
      md: { width: "68%" },
    }),
    action: _style({
      $name: "action",
      position: "absolute",
      inset: 0,
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
    }),
    transition: _style({
      $name: "transition",
      position: "absolute",
      inset: 0,
      padding: "0px 24px",
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "flex-end",
      text_align: "right",
      width: "100%",
    }),
    scene: _style({
      $name: "scene",
      position: "absolute",
      inset: 0,
      display: "flex",
      flex_direction: "column",
      justify_content: "center",
      align_self: "center",
      text_align: "center",
      font_weight: "bold",
    }),
    indicator: _style({
      $name: "indicator",
      preserve_text: true,
      line_height: 1,
      width: 16,
      height: 16,
      position: "absolute",
      right: 16,
      bottom: 16,
      transition: `opacity 0.25s linear`,
      animation: "0.5s infinite bounce",
      animation_play_state: "paused",
    }),
  } as Record<string, ReturnType<typeof _style>>,
  ui: {
    default: _ui({ $name: "default" }),
    image: _ui({ $name: "image", image: {} }),
    text: _ui({ $name: "text", text: {} }),
    loading: _ui({
      $name: "loading",
      loading_bar: {
        loading_fill: {},
      },
    }),
    stage: _ui({
      $name: "stage",
      background: {
        backdrop: {
          image: {},
        },
        portrait: {
          image: {},
        },
        middle: {
          choices: {
            choice_0: {
              choice: {
                text: {},
              },
            },
            choice_1: {
              choice: {
                text: {},
              },
            },
            choice_2: {
              choice: {
                text: {},
              },
            },
            choice_3: {
              choice: {
                text: {},
              },
            },
            choice_4: {
              choice: {
                text: {},
              },
            },
            choice_5: {
              choice: {
                text: {},
              },
            },
          },
        },
        textbox_background: {},
      },
      textbox: {
        textbox_content: {
          character_info: {
            character_name: {
              text: {},
            },
            character_parenthetical: {
              text: {},
            },
          },
          dialogue: {
            text: {},
          },
          action: {
            text: {},
          },
          scene: {
            text: {},
          },
          transition: {
            text: {},
          },
        },
        indicator: {
          text: "▼",
        },
      },
      screen: {},
    }),
  } as Record<string, ReturnType<typeof _ui>>,
  animation: {
    default: _animation({
      $name: "default",
      keyframes: [],
      timing: {
        delay: 0,
        duration: 0,
        easing: "ease",
        iterations: 1,
        direction: "normal",
        fill: "none",
      },
    }),
    show: _animation({
      $name: "show",
      keyframes: [{ opacity: "1" }],
      timing: {
        easing: "linear",
        fill: "forwards",
      },
    }),
    hide: _animation({
      $name: "hide",
      keyframes: [{ opacity: "0" }],
      timing: {
        easing: "linear",
        fill: "forwards",
      },
    }),
    spin: _animation({
      $name: "spin",
      keyframes: [{ transform: "rotate(360deg)" }],
      timing: {
        easing: "linear",
        iterations: "infinite",
      },
    }),
    ping: _animation({
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
    pulse: _animation({
      $name: "pulse",
      keyframes: [
        {
          offset: 0.5,
          opacity: "0.5",
        },
      ],
      timing: {},
    }),
    bounce: _animation({
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
      timing: {},
    }),
    wavy: _animation({
      $name: "wavy",
      keyframes: [
        {
          top: "0",
        },
        {
          top: "calc(1em / -4)",
        },
        {
          top: "0",
        },
      ],
      timing: {
        duration: "750ms",
        easing: "ease-in-out",
        iterations: "infinite",
      },
    }),
    shaky: _animation({
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
      },
    }),
    shake: _animation({
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
      },
    }),
    shaking: _animation({
      $name: "shaking",
      keyframes: [
        {
          offset: 0.0,
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          offset: 0.1,
          transform: "translate(-0.2vh, -0.4vh)",
        },
        {
          offset: 0.2,
          transform: "translate(-0.6vh, 0vh)",
        },
        {
          offset: 0.3,
          transform: "translate(0vh, 0.4vh)",
        },
        {
          offset: 0.4,
          transform: "translate(0.2vh, -0.2vh)",
        },
        {
          offset: 0.5,
          transform: "translate(-0.2vh, 0.4vh)",
        },
        {
          offset: 0.6,
          transform: "translate(-0.6vh, 0.2vh)",
        },
        {
          offset: 0.7,
          transform: "translate(0.4vh, 0.2vh)",
        },
        {
          offset: 0.8,
          transform: "translate(-0.2vh, -0.2vh)",
        },
        {
          offset: 0.9,
          transform: "translate(0.4vh, 0.4vh)",
        },
        {
          offset: 1.0,
          transform: "translate(0.2vh, -0.4vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
        iterations: "infinite",
      },
    }),
    shiver: _animation({
      $name: "shiver",
      keyframes: [
        {
          offset: 0.0,
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          offset: 0.1,
          transform: "translate(-0.1vh, -0.2vh)",
        },
        {
          offset: 0.2,
          transform: "translate(-0.3vh, 0vh)",
        },
        {
          offset: 0.3,
          transform: "translate(0vh, 0.2vh)",
        },
        {
          offset: 0.4,
          transform: "translate(0.1vh, -0.1vh)",
        },
        {
          offset: 0.5,
          transform: "translate(-0.1vh, 0.2vh)",
        },
        {
          offset: 0.6,
          transform: "translate(-0.3vh, 0.1vh)",
        },
        {
          offset: 0.7,
          transform: "translate(0.2vh, 0.1vh)",
        },
        {
          offset: 0.8,
          transform: "translate(-0.1vh, -0.1vh)",
        },
        {
          offset: 0.9,
          transform: "translate(0.2vh, 0.2vh)",
        },
        {
          offset: 1.0,
          transform: "translate(0.1vh, -0.2vh)",
        },
      ],
      timing: {
        duration: "300ms",
        easing: "ease-in-out",
      },
    }),
    shivering: _animation({
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
      },
    }),
    flash: _animation({
      $name: "flash",
      keyframes: [
        {
          background_color: "#999999",
          opacity: "0",
        },
        {
          background_color: "#999999",
          opacity: "1",
        },
        {
          background_color: "#999999",
          opacity: "0",
        },
      ],
      timing: {
        duration: "120ms",
        easing: "linear",
      },
    }),
    fadeout: _animation({
      $name: "fadeout",
      keyframes: [
        {
          background_color: "black",
          opacity: "0",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "forwards",
      },
    }),
    fadein: _animation({
      $name: "fadein",
      keyframes: [
        {
          background_color: "black",
          opacity: "1",
        },
      ],
      timing: {
        duration: "0.5s",
        easing: "linear",
        fill: "forwards",
      },
    }),
    blackout: _animation({
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
        duration: "1s",
        easing: "linear",
        fill: "forwards",
      },
    }),
    blackin: _animation({
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
        duration: "1s",
        easing: "linear",
        fill: "forwards",
      },
    }),
    whiteout: _animation({
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
        duration: "1s",
        easing: "linear",
        fill: "forwards",
      },
    }),
    whitein: _animation({
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
        duration: "1s",
        easing: "linear",
        fill: "forwards",
      },
    }),
  } as Record<string, ReturnType<typeof _animation>>,
  font: {
    default: _font({ $name: "default" }),
  } as Record<string, ReturnType<typeof _font>>,
  shadow: {
    default: _shadow({ $name: "default" }),
    xs: _shadow({
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
    sm: _shadow({
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
    md: _shadow({
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
    lg: _shadow({
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
    xl: _shadow({
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
  } as Record<string, ReturnType<typeof _shadow>>,
  ease: {
    default: _ease({ $name: "default" }),
    none: _ease({
      $name: "none",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    }),
    linear: _ease({
      $name: "linear",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    }),
    sine_in: _ease({ $name: "sine_in", x1: 0.12, y1: 0, x2: 0.39, y2: 0 }),
    sine_out: _ease({ $name: "sine_out", x1: 0.61, y1: 1, x2: 0.88, y2: 1 }),
    sine_in_out: _ease({
      $name: "sine_in_out",
      x1: 0.37,
      y1: 0,
      x2: 0.63,
      y2: 1,
    }),
    quad_in: _ease({ $name: "quad_in", x1: 0.11, y1: 0, x2: 0.5, y2: 0 }),
    quad_out: _ease({ $name: "quad_out", x1: 0.5, y1: 1, x2: 0.89, y2: 1 }),
    quad_in_out: _ease({
      $name: "quad_in_out",
      x1: 0.45,
      y1: 0,
      x2: 0.55,
      y2: 1,
    }),
    cubic_in: _ease({ $name: "cubic_in", x1: 0.32, y1: 0, x2: 0.67, y2: 0 }),
    cubic_out: _ease({ $name: "cubic_out", x1: 0.33, y1: 1, x2: 0.68, y2: 1 }),
    cubic_in_out: _ease({
      $name: "cubic_in_out",
      x1: 0.65,
      y1: 0,
      x2: 0.35,
      y2: 1,
    }),
    quart_in: _ease({ $name: "quart_in", x1: 0.5, y1: 0, x2: 0.75, y2: 0 }),
    quart_out: _ease({ $name: "quart_out", x1: 0.25, y1: 1, x2: 0.5, y2: 1 }),
    quart_in_out: _ease({
      $name: "quart_in_out",
      x1: 0.76,
      y1: 0,
      x2: 0.24,
      y2: 1,
    }),
    quint_in: _ease({ $name: "quint_in", x1: 0.64, y1: 0, x2: 0.78, y2: 0 }),
    quint_out: _ease({ $name: "quint_out", x1: 0.22, y1: 1, x2: 0.36, y2: 1 }),
    quint_in_out: _ease({
      $name: "quint_in_out",
      x1: 0.83,
      y1: 0,
      x2: 0.17,
      y2: 1,
    }),
    expo_in: _ease({ $name: "expo_in", x1: 0.7, y1: 0, x2: 0.84, y2: 0 }),
    expo_out: _ease({ $name: "expo_out", x1: 0.16, y1: 1, x2: 0.3, y2: 1 }),
    expo_in_out: _ease({
      $name: "expo_in_out",
      x1: 0.87,
      y1: 0,
      x2: 0.13,
      y2: 1,
    }),
    circ_in: _ease({ $name: "circ_in", x1: 0.55, y1: 0, x2: 1, y2: 0.45 }),
    circ_out: _ease({ $name: "circ_out", x1: 0, y1: 0.55, x2: 0.45, y2: 1 }),
    circ_in_out: _ease({
      $name: "circ_in_out",
      x1: 0.85,
      y1: 0,
      x2: 0.15,
      y2: 1,
    }),
    back_in: _ease({ $name: "back_in", x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 }),
    back_out: _ease({ $name: "back_out", x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }),
    back_in_out: _ease({
      $name: "back_in_out",
      x1: 0.68,
      y1: -0.6,
      x2: 0.32,
      y2: 1.6,
    }),
  } as Record<string, ReturnType<typeof _ease>>,
  gradient: {
    default: _gradient({ $name: "default" }),
  } as Record<string, ReturnType<typeof _gradient>>,
  graphic: {
    default: _graphic({
      $name: "default",
    }),
  } as Record<string, ReturnType<typeof _graphic>>,
  html: {},
  css: {},
});

export type UIBuiltins = ReturnType<typeof uiBuiltins>;
