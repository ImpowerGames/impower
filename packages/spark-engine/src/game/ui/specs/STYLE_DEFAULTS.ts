import { SparkStyleProperties } from "../types/Style";

const STYLE_PROPS: SparkStyleProperties = {
  position: "",
  aspect: "",
  overflowX: "",
  overflowY: "",
  z: "",
  width: "",
  widthMin: "",
  widthMax: "",
  height: "",
  heightMin: "",
  heightMax: "",
  corner: "",
  cornerT: "",
  cornerR: "",
  cornerB: "",
  cornerL: "",
  cornerTL: "",
  cornerTR: "",
  cornerBR: "",
  cornerBL: "",
  inset: "",
  insetT: "",
  insetR: "",
  insetB: "",
  insetL: "",
  insetLR: "",
  insetTB: "",
  margin: "",
  marginT: "",
  marginR: "",
  marginB: "",
  marginL: "",
  marginLR: "",
  marginTB: "",
  padding: "",
  paddingT: "",
  paddingR: "",
  paddingB: "",
  paddingL: "",
  paddingLR: "",
  paddingTB: "",
  childLayout: "",
  childGap: "",
  childAlign: "",
  childJustify: "",
  selfAlign: "",
  overflowOverflow: "",
  grow: "",
  shrink: "",
  invisible: false,
  interactable: false,
  selectable: false,
  fill: "",
  stroke: "",
  strokeWidth: "",
  color: "",
  textFont: "",
  textSize: "",
  textLeading: "",
  textKerning: "",
  textWeight: 400,
  textItalic: false,
  textUnderline: false,
  textStrikethrough: false,
  textCase: "",
  textAlign: "",
  textOverflow: "",
  textColor: "",
  textStrokeColor: "",
  textStrokeWidth: "",
  textDecorationThickness: "",
  textUnderlineOffset: "",
  bgColor: "",
  bgGradient: "",
  bgPattern: "",
  bgImage: "",
  bgRepeat: false,
  bgAlign: "",
  bgFit: "",
  clip: "",
  borderColor: "",
  borderWidth: "",
  shadow: "",
  shadowInset: "",
  blur: "",
  brightness: "",
  contrast: "",
  grayscale: "",
  hue: "",
  invert: "",
  sepia: "",
  saturate: "",
  blend: "",
  opacity: "",
  translateX: "",
  translateY: "",
  translateZ: "",
  rotateX: "",
  rotateY: "",
  rotateZ: "",
  scaleX: "",
  scaleY: "",
  scaleZ: "",
  skewX: "",
  skewY: "",
  pivot: "",
  delay: "",
  duration: "",
  ease: "",
  animate: "",
};

export const STYLE_DEFAULTS = {
  "": {
    ...STYLE_PROPS,
    xs: STYLE_PROPS,
    sm: STYLE_PROPS,
    md: STYLE_PROPS,
    lg: STYLE_PROPS,
    xl: STYLE_PROPS,
    hovered: STYLE_PROPS,
    pressed: STYLE_PROPS,
    focused: STYLE_PROPS,
    checked: STYLE_PROPS,
    disabled: STYLE_PROPS,
  },
  "hidden *": {
    opacity: 0,
    pointerEvents: "none",
  },
  LoadingBar: {
    zIndex: 1000,
    position: "relative",
    width: "100%",
    height: 4,
  },
  LoadingFill: {
    width: "100%",
    height: "100%",
    backgroundColor: "cyan50",
    transform: "scaleX({LOADING_PROGRESS})",
    transformOrigin: "left",
  },
  Background: {
    position: "absolute",
    inset: 0,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  Portrait: {
    position: "absolute",
    top: "10%",
    right: 0,
    bottom: 0,
    left: 0,
    display: "flex",
    flexDirection: "column",
  },
  ChoiceGroup: {
    position: "relative",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    md: {
      fontSize: "1.125rem",
    },
  },
  Choices: {
    display: "flex",
    flexDirection: "column",
    paddingLeft: "10%",
    paddingRight: "10%",
  },
  Choice: {
    backgroundColor: "white",
    padding: 8,
  },
  Box: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    maxWidth: 800,
    height: 224,
    width: "100%",
    margin: "0 auto",
    backgroundColor: "white",
  },
  Content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignContent: "center",
    position: "absolute",
    inset: 0,
    padding: 16,
    fontSize: "1rem",
    md: { paddingLeft: 32, paddingRight: 32, fontSize: "1.125rem" },
  },
  Indicator: {
    width: 16,
    height: 16,
    position: "absolute",
    right: 16,
    bottom: 16,
    animation: "0.25s ease infinite alternate SLIDE_UP",
    animationPlayState: "paused",
  },
  DescriptionGroup: {
    width: "100%",
    height: "100%",
  },
  DescriptionBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  DescriptionContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: 640,
  },
  Centered: {
    textAlign: "center",
  },
  Transition: {
    textAlign: "right",
    width: "100%",
  },
  Scene: {
    textAlign: "center",
    fontWeight: "bold",
  },
  DialogueGroup: {
    flex: 1,
  },
  DialogueContent: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 16,
    width: "80%",
    margin: "0 auto",
    md: { width: "68%" },
  },
  Character: {
    lineHeight: 1,
    fontSize: "1.5rem",
    textAlign: "center",
    md: { fontSize: "1.75rem" },
  },
  Parenthetical: {
    textAlign: "center",
  },
  Dialogue: {
    flex: 1,
  },
};