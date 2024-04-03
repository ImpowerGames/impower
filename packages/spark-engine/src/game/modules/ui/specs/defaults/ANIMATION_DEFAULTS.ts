export const ANIMATION_DEFAULTS = {
  default: {},
  show: {
    from: {
      opacity: "0",
    },
    to: {
      opacity: "1",
    },
    timing: {
      animation_timing_function: "linear",
      animation_fill_mode: "both",
    },
  },
  hide: {
    from: {
      opacity: "1",
    },
    to: {
      opacity: "0",
    },
    timing: {
      animation_timing_function: "linear",
      animation_fill_mode: "both",
    },
  },
  write: {
    to: {
      opacity: "1",
    },
    timing: {
      animation_timing_function: "linear",
      animation_fill_mode: "both",
    },
  },
  spin: {
    to: {
      transform: "rotate(360deg)",
    },
  },
  ping: {
    "75%, 100%": {
      transform: "scale(2)",
      opacity: "0",
    },
  },
  pulse: {
    "50%": {
      opacity: ".5",
    },
  },
  bounce: {
    "0%, 100%": {
      transform: "translateY(-50%)",
      animation_timing_function: "cubic-bezier(0.8,0,1,1)",
    },
    "50%": {
      transform: "none",
      animation_timing_function: "cubic-bezier(0,0,0.2,1)",
    },
  },
  floating: {
    "0%": {
      top: "0",
    },
    "50%": {
      top: "calc(1em / -4)",
    },
    "100%": {
      top: "0",
    },
    timing: {
      animation_duration: "750ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  trembling: {
    "0%": {
      left: "calc(1em / 60)",
      top: "calc(1em / 60)",
    },
    "10%": {
      left: "calc(-1em / 60)",
      top: "calc(-2em / 60)",
    },
    "20%": {
      left: "calc(-2em / 60)",
      top: "calc(0em / 60)",
    },
    "30%": {
      left: "calc(2em / 60)",
      top: "calc(2em / 60)",
    },
    "40%": {
      left: "calc(1em / 60)",
      top: "calc(-1em / 60)",
    },
    "50%": {
      left: "calc(-1em / 60)",
      top: "calc(2em / 60)",
    },
    "60%": {
      left: "calc(-2em / 60)",
      top: "calc(1em / 60)",
    },
    "70%": {
      left: "calc(2em / 60)",
      top: "calc(1em / 60)",
    },
    "80%": {
      left: "calc(-1em / 60)",
      top: "calc(-1em / 60)",
    },
    "90%": {
      left: "calc(1em / 60)",
      top: "calc(2em / 60)",
    },
    "100%": {
      left: "calc(1em / 60)",
      top: "calc(-2em / 60)",
    },
    timing: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  shake: {
    "0%": {
      transform: "translate(0.4vh, 0.2vh)",
    },
    "10%": {
      transform: "translate(-0.2vh, -0.4vh)",
    },
    "20%": {
      transform: "translate(-0.6vh, 0vh)",
    },
    "30%": {
      transform: "translate(0vh, 0.4vh)",
    },
    "40%": {
      transform: "translate(0.2vh, -0.2vh)",
    },
    "50%": {
      transform: "translate(-0.2vh, 0.4vh)",
    },
    "60%": {
      transform: "translate(-0.6vh, 0.2vh)",
    },
    "70%": {
      transform: "translate(0.4vh, 0.2vh)",
    },
    "80%": {
      transform: "translate(-0.2vh, -0.2vh)",
    },
    "90%": {
      transform: "translate(0.4vh, 0.4vh)",
    },
    "100%": {
      transform: "translate(0.2vh, -0.4vh)",
    },
    timing: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
    },
  },
  shaking: {
    "0%": {
      transform: "translate(0.4vh, 0.2vh)",
    },
    "10%": {
      transform: "translate(-0.2vh, -0.4vh)",
    },
    "20%": {
      transform: "translate(-0.6vh, 0vh)",
    },
    "30%": {
      transform: "translate(0vh, 0.4vh)",
    },
    "40%": {
      transform: "translate(0.2vh, -0.2vh)",
    },
    "50%": {
      transform: "translate(-0.2vh, 0.4vh)",
    },
    "60%": {
      transform: "translate(-0.6vh, 0.2vh)",
    },
    "70%": {
      transform: "translate(0.4vh, 0.2vh)",
    },
    "80%": {
      transform: "translate(-0.2vh, -0.2vh)",
    },
    "90%": {
      transform: "translate(0.4vh, 0.4vh)",
    },
    "100%": {
      transform: "translate(0.2vh, -0.4vh)",
    },
    timing: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  shiver: {
    "0%": {
      transform: "translate(0.2vh, 0.1vh)",
    },
    "10%": {
      transform: "translate(-0.1vh, -0.2vh)",
    },
    "20%": {
      transform: "translate(-0.3vh, 0vh)",
    },
    "30%": {
      transform: "translate(0vh, 0.2vh)",
    },
    "40%": {
      transform: "translate(0.1vh, -0.1vh)",
    },
    "50%": {
      transform: "translate(-0.1vh, 0.2vh)",
    },
    "60%": {
      transform: "translate(-0.3vh, 0.1vh)",
    },
    "70%": {
      transform: "translate(0.2vh, 0.1vh)",
    },
    "80%": {
      transform: "translate(-0.1vh, -0.1vh)",
    },
    "90%": {
      transform: "translate(0.2vh, 0.2vh)",
    },
    "100%": {
      transform: "translate(0.1vh, -0.2vh)",
    },
    timing: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
    },
  },
  shivering: {
    "0%": {
      transform: "translate(0.2vh, 0.1vh)",
    },
    "10%": {
      transform: "translate(-0.1vh, -0.2vh)",
    },
    "20%": {
      transform: "translate(-0.3vh, 0vh)",
    },
    "30%": {
      transform: "translate(0vh, 0.2vh)",
    },
    "40%": {
      transform: "translate(0.1vh, -0.1vh)",
    },
    "50%": {
      transform: "translate(-0.1vh, 0.2vh)",
    },
    "60%": {
      transform: "translate(-0.3vh, 0.1vh)",
    },
    "70%": {
      transform: "translate(0.2vh, 0.1vh)",
    },
    "80%": {
      transform: "translate(-0.1vh, -0.1vh)",
    },
    "90%": {
      transform: "translate(0.2vh, 0.2vh)",
    },
    "100%": {
      transform: "translate(0.1vh, -0.2vh)",
    },
    timing: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
};
