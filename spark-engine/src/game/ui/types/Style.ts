import { EaseType } from "../../core";

export interface SparkStyleProperties {
  /** position */
  placement: "relative" | "absolute" | "fixed" | "sticky";

  /** top, bottom, left, right */
  anchor:
    | "stretch"
    | "top-stretch"
    | "middle-stretch"
    | "bottom-stretch"
    | "left-stretch"
    | "center-stretch"
    | "right-stretch"
    | "top-left"
    | "top-center"
    | "top-right"
    | "middle-left"
    | "middle-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";

  /** margin-top */
  marginTop: number;
  /** margin-right */
  marginRight: number;
  /** margin-bottom */
  marginBottom: number;
  /** margin-left */
  marginLeft: number;

  /** padding-top */
  paddingTop: number;
  /** padding-right */
  paddingRight: number;
  /** padding-bottom */
  paddingBottom: number;
  /** padding-left */
  paddingLeft: number;

  /** min-width */
  widthMin: number;
  /** max-width */
  widthMax: number;

  /** min-height */
  heightMin: number;
  /** max-height */
  heightMax: number;

  /** aspect-ratio */
  aspectRatio:
    | "none"
    | "1:1"
    | "16:9"
    | "9:16"
    | "4:5"
    | "2:3"
    | "2:1"
    | string;

  /** flex */
  stretch: number;

  /** z-index */
  depth: number;

  /** border-radius, clip-path */
  cornerShape:
    | "round"
    | "round-top"
    | "round-bottom"
    | "round-left"
    | "round-right"
    | "round-top-right"
    | "round-top-left"
    | "round-bottom-right"
    | "round-bottom-left"
    | "cut"
    | "cut-top"
    | "cut-bottom"
    | "cut-left"
    | "cut-right"
    | "cut-top-right"
    | "cut-top-left"
    | "cut-bottom-right"
    | "cut-bottom-left";
  /** border-radius, clip-path */
  cornerRadius: number;

  /** background-color */
  backgroundColor: "none" | "black" | "white" | string;
  /** background-image: <linear-gradient|radial-gradient> */
  backgroundGradient: "none" | string;
  /** background-image: <url> */
  backgroundPattern: "none" | string;
  /** background-image: <url> */
  backgroundGraphic: "none" | string;
  /** background-repeat */
  backgroundRepeat: boolean;
  /** background-position */
  backgroundAlign: "center" | "top" | "right" | "bottom" | "left";
  /** background-size */
  backgroundFit: "cover" | "contain";
  /** box-shadow */
  backgroundShadow: "none" | "xs" | "sm" | "md" | "lg" | "xl" | string;

  /** backdrop-filter: blur, brightness, contrast, drop-shadow, grayscale, hue-rotate, invert, saturate, sepia */
  backdropFilter: "none" | string;
  /** filter: blur, brightness, contrast, drop-shadow, grayscale, hue-rotate, invert, saturate, sepia */
  filter: "none" | string;

  /** font-family, font-size, line-height, letter-spacing, font-weight, text-shadow, text-decoration-thickness, text-underline-offset */
  textRole: "display" | "headline" | "title" | "label" | "body" | string;
  /** font-size */
  textSize: "xs" | "sm" | "md" | "lg" | "xl" | string;
  /** color */
  textColor: "black" | "white" | string;
  /** font-weight */
  textBold: boolean;
  /** font-style */
  textItalic: boolean;
  /** text-decoration */
  textUnderline: boolean;
  /** text-decoration */
  textStrikethrough: boolean;
  /** white-space */
  textWrap: boolean;
  /** textAlign */
  textAlign: "left" | "right" | "center" | "justify";
  /** text-transform */
  textCase: "none" | "uppercase" | "lowercase" | "capitalize";
  /** font-family */
  textFont: "auto" | string;
  /** line-height */
  textHeight: "auto" | number;
  /** letter-spacing */
  textKerning: "auto" | number;
  /** text-shadow */
  textStroke: "auto" | number;
  /** text-decoration-thickness */
  textUnderlineThickness: "auto" | number;
  /** text-underline-offset */
  textUnderlineOffset: "auto" | number;

  /** display: flex; flex-direction: */
  layout: "column" | "row" | "column-reverse" | "row-reverse";
  /** align-items */
  layoutAlign: "start" | "center" | "end" | "stretch";
  /** justify-content */
  layoutJustify:
    | "center"
    | "start"
    | "end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  /** flex-wrap */
  layoutWrap: boolean;

  /** overflow */
  overflow: "hidden" | "visible" | "scroll";

  /** opacity */
  opacity: number;
  /** transition: opacity <duration> */
  opacityDuration: number;
  /** transition: opacity <delay> */
  opacityDelay: number;
  /** transition: opacity <ease> */
  opacityEase: EaseType | string;

  /** transform: translateX */
  transformPositionX: number;
  /** transform: translateY */
  transformPositionY: number;
  /** transform: translateZ */
  transformPositionZ: number;
  /** transform: rotateX */
  transformRotationX: number;
  /** transform: rotateY */
  transformRotationY: number;
  /** transform: rotateZ */
  transformRotationZ: number;
  /** transform: scaleX */
  transformScaleX: number;
  /** transform: scaleY */
  transformScaleY: number;
  /** transform: scaleZ */
  transformScaleZ: number;
  /** transform-origin */
  transformPivot: "center" | "left" | "right" | "top" | "bottom";
  /** transition: transform <duration> */
  transformDuration: number;
  /** transition: transform <delay> */
  transformDelay: number;
  /** transition: transform <timing-function> */
  transformEase: EaseType | string;

  /** animation: <name> */
  animation: "none" | string;
  /** animation: <timing-function> */
  animationEase: EaseType | string;
  /** animation: <duration> */
  animationDuration: number;
  /** animation: <delay> */
  animationDelay: number;
  /** animation: <iteration-count> */
  animationRepeat: boolean;
  /** animation: <direction> */
  animationDirection: "forward" | "reverse" | "alternate" | "forward-reverse";
  /** animation: <play-state> */
  animationRunning: boolean;
}

export interface Style extends SparkStyleProperties, Record<string, any> {}
