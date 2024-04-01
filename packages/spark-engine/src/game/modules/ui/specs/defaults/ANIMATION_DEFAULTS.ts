export const ANIMATION_DEFAULTS = {
  default: {},
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
    style: {
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
    style: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  shake: {
    "0%": {
      transform: "translate(2px, 1px)",
    },
    "10%": {
      transform: "translate(-1px, -2px)",
    },
    "20%": {
      transform: "translate(-3px, 0px)",
    },
    "30%": {
      transform: "translate(0px, 2px)",
    },
    "40%": {
      transform: "translate(1px, -1px)",
    },
    "50%": {
      transform: "translate(-1px, 2px)",
    },
    "60%": {
      transform: "translate(-3px, 1px)",
    },
    "70%": {
      transform: "translate(2px, 1px)",
    },
    "80%": {
      transform: "translate(-1px, -1px)",
    },
    "90%": {
      transform: "translate(2px, 2px)",
    },
    "100%": {
      transform: "translate(1px, -2px)",
    },
    style: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
    },
  },
  shaking: {
    "0%": {
      transform: "translate(2px, 1px)",
    },
    "10%": {
      transform: "translate(-1px, -2px)",
    },
    "20%": {
      transform: "translate(-3px, 0px)",
    },
    "30%": {
      transform: "translate(0px, 2px)",
    },
    "40%": {
      transform: "translate(1px, -1px)",
    },
    "50%": {
      transform: "translate(-1px, 2px)",
    },
    "60%": {
      transform: "translate(-3px, 1px)",
    },
    "70%": {
      transform: "translate(2px, 1px)",
    },
    "80%": {
      transform: "translate(-1px, -1px)",
    },
    "90%": {
      transform: "translate(2px, 2px)",
    },
    "100%": {
      transform: "translate(1px, -2px)",
    },
    style: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  shivering: {
    "0%": {
      transform: "translate(1px, 0.5px)",
    },
    "10%": {
      transform: "translate(-0.5px, -1px)",
    },
    "20%": {
      transform: "translate(-1.5px, 0px)",
    },
    "30%": {
      transform: "translate(0px, 1px)",
    },
    "40%": {
      transform: "translate(0.5px, -0.5px)",
    },
    "50%": {
      transform: "translate(-0,5px, 1px)",
    },
    "60%": {
      transform: "translate(-1.5px, 0.5px)",
    },
    "70%": {
      transform: "translate(1px, 0.5px)",
    },
    "80%": {
      transform: "translate(-0.5px, -0.5px)",
    },
    "90%": {
      transform: "translate(1px, 1px)",
    },
    "100%": {
      transform: "translate(0.5px, -1px)",
    },
    style: {
      animation_duration: "300ms",
      animation_timing_function: "ease-in-out",
      animation_iteration_count: "infinite",
    },
  },
  fadein: {
    from: {
      opacity: "0",
    },
    to: {
      opacity: "1",
    },
    style: {
      animation_fill_mode: "both",
    },
  },
  fadeout: {
    from: {
      opacity: "1",
    },
    to: {
      opacity: "0",
    },
    style: {
      animation_fill_mode: "both",
    },
  },
};
