export const ANIMATION_DEFAULTS = {
  "": {},
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
  },
};
