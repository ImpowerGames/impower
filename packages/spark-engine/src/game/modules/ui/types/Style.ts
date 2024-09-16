import { Reference } from "../../../core/types/Reference";

export interface SparkStyleProperties {
  /** position */
  position: "" | "default" | "relative" | "fixed" | "absolute" | "sticky";

  /** aspect-ratio */
  aspect: "1/1" | "16/9" | "9/16" | "4/5" | "2/3" | "2/1" | string;

  /** overflow-x */
  overflowX: "" | "visible" | "scroll" | "clip";
  /** overflow-y */
  overflowY: "" | "visible" | "scroll" | "clip";

  /** z-index */
  z: "" | number;

  /** width */
  width: "" | "100%" | "min-content" | "max-content" | number;
  /** min-width */
  widthMin: "" | "100%" | "min-content" | "max-content" | number;
  /** max-width */
  widthMax: "" | "100%" | "min-content" | "max-content" | number;

  /** height */
  height: "" | "100%" | "min-content" | "max-content" | number;
  /** min-height */
  heightMin: "" | "100%" | "min-content" | "max-content" | number;
  /** max-height */
  heightMax: "" | "100%" | "min-content" | "max-content" | number;

  /** border-top-left-radius, border-left-right-radius, border-bottom-left-radius, border-bottom-right-radius */
  corner: "" | number;
  /** border-top-left-radius, border-top-right-radius */
  cornerT: "" | number;
  /** border-top-right-radius, border-bottom-right-radius */
  cornerR: "" | number;
  /** border-bottom-left-radius, border-bottom-right-radius */
  cornerB: "" | number;
  /** border-top-left-radius, border-bottom-left-radius */
  cornerL: "" | number;
  /** border-top-left-radius */
  cornerTL: "" | number;
  /** border-top-right-radius */
  cornerTR: "" | number;
  /** border-bottom-right-radius */
  cornerBR: "" | number;
  /** border-bottom-left-radius */
  cornerBL: "" | number;

  /** top, right, bottom, left */
  inset: "" | number;
  /** margin-top */
  insetT: "" | number;
  /** margin-right */
  insetR: "" | number;
  /** margin-bottom */
  insetB: "" | number;
  /** margin-left */
  insetL: "" | number;
  /** left, right */
  insetLR: "" | number;
  /** top, bottom */
  insetTB: "" | number;

  /** margin-top, margin-right, margin-bottom, margin-left  */
  margin: "" | number;
  /** margin-top */
  marginT: "" | number;
  /** margin-right */
  marginR: "" | number;
  /** margin-bottom */
  marginB: "" | number;
  /** margin-left */
  marginL: "" | number;
  /** margin-left, margin-right */
  marginLR: "" | number;
  /** margin-top, margin-bottom */
  marginTB: "" | number;

  /** padding-top, padding-right, padding-bottom, padding-left  */
  padding: "" | number;
  /** padding-top */
  paddingT: "" | number;
  /** padding-right */
  paddingR: "" | number;
  /** padding-bottom */
  paddingB: "" | number;
  /** padding-left */
  paddingL: "" | number;
  /** padding-left, padding-right */
  paddingLR: "" | number;
  /** padding-top, padding-bottom */
  paddingTB: "" | number;

  /** display:flex, flex-direction */
  childLayout: "" | "row" | "column" | "row-reverse" | "column-reverse";
  /** gap */
  childGap: "" | number;
  /** align-items */
  childAlign: "" | "center" | "stretch" | "start" | "end";
  /** justify-content */
  childJustify:
    | ""
    | "center"
    | "stretch"
    | "start"
    | "end"
    | "between"
    | "around"
    | "evenly";
  /** flex-wrap */
  overflowOverflow: "" | "visible" | "wrap" | "wrap-reverse";
  /** align-self */
  selfAlign: "" | "center" | "stretch" | "start" | "end";

  /** flex */
  grow: "" | number;
  shrink: "" | number;

  /** visibility */
  invisible: boolean;
  /** pointer-events */
  interactable: boolean;
  /** user-select */
  selectable: boolean;

  /** fill */
  fill:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** stroke */
  stroke:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** strokeWidth */
  strokeWidth: "" | number;

  /** background-color */
  color:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;

  /** font-family */
  textFont: "" | "sans" | "serif" | "mono" | string;
  /** font-size */
  textSize:
    | ""
    | "2xs"
    | "xs"
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "8xl"
    | "9xl";
  /** line-height */
  textLeading: "" | number;
  /** letter-spacing */
  textKerning: "" | number;
  /** font-weight */
  textWeight: "" | number;
  /** font-style */
  textItalic: boolean;
  /** text-decoration */
  textUnderline: boolean;
  /** text-decoration */
  textStrikethrough: boolean;
  /** text-transform */
  textCase: "" | "uppercase" | "lowercase" | "capitalize";
  /** text-align */
  textAlign: "" | "center" | "start" | "end" | "justify";
  /** text-overflow, white-space */
  textOverflow: "" | "visible" | "wrap" | "clip" | "ellipsis";
  /** color */
  textColor:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** text-shadow */
  textStrokeColor:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** text-shadow */
  textStrokeWidth: "" | number;
  /** text-decoration-thickness */
  textDecorationThickness: "" | number;
  /** text-underline-offset */
  textUnderlineOffset: "" | number;

  /** background-color */
  bgColor:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** background-image: --backgroundGradient */
  bgGradient: "" | "none" | string;
  /** background-image: --backgroundPattern */
  bgPattern: "" | "none" | string;
  /** background-image: --backgroundImage */
  bgImage: "" | "none" | string;
  /** background-repeat */
  bgRepeat: boolean;
  /** background-position */
  bgAlign: "" | "center" | "top" | "bottom" | "left" | "right";
  /** background-size */
  bgFit: "" | "contain" | "cover";

  /** clip-path */
  clip: "" | "circle" | string;

  /** border-color, border-style:solid */
  borderColor:
    | ""
    | "none"
    | "fg"
    | "bg"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuchsia"
    | "pink"
    | "rose"
    | string;
  /** border-width, border-style:solid */
  borderWidth: "" | number;

  /** filter: drop-shadow */
  shadow: "" | number;
  /** box-shadow */
  shadowInset: "" | number;

  /** backdrop-filter: blur */
  blur: "" | number;
  /** backdrop-filter: brightness*/
  brightness: "" | number;
  /** backdrop-filter: contrast */
  contrast: "" | number;
  /** backdrop-filter: grayscale */
  grayscale: "" | number;
  /** backdrop-filter: hue-rotate */
  hue: "" | number;
  /** backdrop-filter: invert */
  invert: "" | number;
  /** backdrop-filter: sepia */
  sepia: "" | number;
  /** backdrop-filter: saturate */
  saturate: "" | number;

  blend:
    | ""
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity";

  /** opacity */
  opacity: "" | number;

  /** transform: translateX */
  translateX: "" | number;
  /** transform: translateY */
  translateY: "" | number;
  /** transform: translateZ */
  translateZ: "" | number;
  /** transform: rotateX */
  rotateX: "" | number;
  /** transform: rotateY */
  rotateY: "" | number;
  /** transform: rotateZ */
  rotateZ: "" | number;
  /** transform: scaleX */
  scaleX: "" | number;
  /** transform: scaleY */
  scaleY: "" | number;
  /** transform: scaleZ */
  scaleZ: "" | number;
  /** transform: skewX */
  skewX: "" | number;
  /** transform: skewY */
  skewY: "" | number;

  /** transform-origin */
  pivot: "" | "center" | "top" | "left" | "bottom" | "right";

  /** transition-delay */
  delay: "" | number;
  /** transition-duration */
  duration: "" | number;
  /** transition-timing-function */
  ease:
    | ""
    | "linear"
    | "ease"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "ease-in-sine"
    | "ease-in-sine"
    | "ease-out-sine"
    | "ease-in-out-sine"
    | "ease-in-quad"
    | "ease-out-quad"
    | "ease-in-out-quad"
    | "ease-in-cubic"
    | "ease-out-cubic"
    | "ease-in-out-cubic"
    | "ease-in-quart"
    | "ease-out-quart"
    | "ease-in-out-quart"
    | "ease-in-quint"
    | "ease-out-quint"
    | "ease-in-out-quint"
    | "ease-in-expo"
    | "ease-out-expo"
    | "ease-in-out-expo"
    | "ease-in-circ"
    | "ease-out-circ"
    | "ease-in-out-circ"
    | "ease-in-back"
    | "ease-out-back"
    | "ease-in-out-back"
    | string;

  /** animation: <name> */
  animate: "" | "spin" | "ping" | "bounce" | "blink" | "sheen" | string;
}

export interface Style extends Reference<"style">, Record<string, any> {}
