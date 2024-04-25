import { _animation } from "../_animation";

export const ANIMATION_DEFAULTS = {
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
  floating: _animation({
    $name: "floating",
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
  trembling: _animation({
    $name: "trembling",
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
};
