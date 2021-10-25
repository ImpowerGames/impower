import { Alignment } from "../types/enums/alignment";

const getAlignItems = (
  alignment: Alignment
): "center" | "flex-start" | "flex-end" => {
  switch (alignment) {
    case Alignment.TopCenter:
    case Alignment.TopLeft:
    case Alignment.TopRight:
      return "flex-start";
    case Alignment.BottomCenter:
    case Alignment.BottomLeft:
    case Alignment.BottomRight:
      return "flex-end";
    default:
      return "center";
  }
};

const getJustifyContent = (
  alignment: Alignment
): "center" | "flex-start" | "flex-end" => {
  switch (alignment) {
    case Alignment.MiddleLeft:
    case Alignment.TopLeft:
    case Alignment.BottomLeft:
      return "flex-start";
    case Alignment.MiddleRight:
    case Alignment.TopRight:
    case Alignment.BottomRight:
      return "flex-end";
    default:
      return "center";
  }
};

const getAlignmentStyle = (
  alignment: Alignment
): {
  alignItems: "center" | "flex-start" | "flex-end";
  justifyContent: "center" | "flex-start" | "flex-end";
} => {
  return {
    alignItems: getAlignItems(alignment),
    justifyContent: getJustifyContent(alignment),
  };
};

export default getAlignmentStyle;
