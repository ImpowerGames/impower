import { SparkStyleProperties, Theme } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

const GRID_STEP = 8;

export const STYLE_PROPS_VALIDATION = (objectMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<SparkStyleProperties> => {
  const theme: Theme = (objectMap?.["theme"]?.[""] || {}) as Theme;
  const typography = theme.typography || {};
  const colorNames = Object.keys(theme?.colors || {});
  const gradientNames = Object.keys(objectMap?.["gradient"] || {});
  const patternNames = Object.keys(objectMap?.["pattern"] || {});
  const graphicNames = Object.keys(objectMap?.["graphic"] || {});
  const shadowNames = Object.keys(objectMap?.["shadow"] || {});
  const animationNames = Object.keys(objectMap?.["animation"] || {});
  const easeNames = Object.keys(objectMap?.["ease"] || {});
  const fontNames = Object.keys(objectMap?.["font"] || {});
  return {
    placement: ["relative", "absolute", "fixed", "sticky"],
    anchor: [
      "stretch",
      "top-stretch",
      "middle-stretch",
      "bottom-stretch",
      "left-stretch",
      "center-stretch",
      "right-stretch",
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
    marginTop: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    marginRight: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    marginBottom: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    marginLeft: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    paddingTop: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    paddingRight: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    paddingBottom: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    paddingLeft: [GRID_STEP, 0, Math.pow(GRID_STEP, 2)],
    widthMin: [GRID_STEP, 0, Math.pow(GRID_STEP, 3)],
    widthMax: [GRID_STEP, -1, Math.pow(GRID_STEP, 3)],
    heightMin: [GRID_STEP, 0, Math.pow(GRID_STEP, 3)],
    heightMax: [GRID_STEP, -1, Math.pow(GRID_STEP, 3)],
    aspectRatio: ["none", "1:1", "16:9", "9:16", "4:5", "2:3", "2:1"],
    stretch: [1, 0, 10],
    depth: [1, 0, 10],
    cornerShape: [
      "round",
      "round-top",
      "round-bottom",
      "round-left",
      "round-right",
      "round-top-right",
      "round-top-left",
      "round-bottom-right",
      "round-bottom-left",
      "cut",
      "cut-top",
      "cut-bottom",
      "cut-left",
      "cut-right",
      "cut-top-right",
      "cut-top-left",
      "cut-bottom-right",
      "cut-bottom-left",
    ],
    cornerRadius: [GRID_STEP / 2, 0, Math.pow(GRID_STEP, 2)],
    backgroundColor: ["none", ...colorNames],
    backgroundGradient: ["none", ...gradientNames],
    backgroundPattern: ["none", ...patternNames],
    backgroundGraphic: ["none", ...graphicNames],
    backgroundShadow: ["none", ...shadowNames],
    backgroundAlign: ["center", "top", "right", "bottom", "left"],
    backgroundFit: ["cover", "contain"],
    backdropFilter: ["none", "blur(8px)", "saturate(50%)", "sepia(50%)"],
    filter: ["none", "blur(8px)", "saturate(50%)", "sepia(50%)"],
    textRole: Object.keys(typography),
    textSize: [
      ...Array.from(
        new Set(Object.values(typography).flatMap((t) => Object.keys(t)))
      ),
    ],
    textFont: [
      ...Array.from(
        new Set([
          ...Object.values(typography).flatMap((t) =>
            Object.values(t).flatMap((x) => x.font)
          ),
          ...fontNames,
        ])
      ),
    ],
    textColor: colorNames,
    textAlign: ["center", "left", "right", "justify"],
    textCase: ["none", "uppercase", "lowercase", "capitalize"],
    layout: ["column", "row", "column-reverse", "row-reverse"],
    layoutAlign: ["center", "start", "end", "stretch"],
    layoutJustify: [
      "center",
      "start",
      "end",
      "space-between",
      "space-around",
      "space-evenly",
    ],
    overflow: ["hidden", "visible", "scroll"],
    opacity: [0.01, 0, 1],
    opacityDuration: [0.01, 0, 1],
    opacityDelay: [0.01, 0, 1],
    opacityEase: easeNames,
    transformPivot: ["center", "left", "right", "top", "bottom"],
    transformPositionX: [1, 0, 100],
    transformPositionY: [1, 0, 100],
    transformPositionZ: [1, 0, 100],
    transformRotationX: [1, 0, 360],
    transformRotationY: [1, 0, 360],
    transformRotationZ: [1, 0, 360],
    transformScaleX: [0.01, 0, 4],
    transformScaleY: [0.01, 0, 4],
    transformScaleZ: [1, 0, 360],
    transformDuration: [0.01, 0, 1],
    transformDelay: [0.01, 0, 1],
    transformEase: easeNames,
    animation: ["none", ...animationNames],
    animationDuration: [0.01, 0, 1],
    animationDelay: [0.01, 0, 1],
    animationEase: easeNames,
    animationDirection: ["forward", "reverse", "alternate", "forward-reverse"],
  };
};
