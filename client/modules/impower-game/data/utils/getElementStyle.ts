import {
  List,
  Color,
  getColorRgbString,
  UnitNumberData,
} from "../../../impower-core";
import { ArrangementType } from "../enums/arrangementType";
import { FillType } from "../enums/fillType";
import { GradientType } from "../enums/gradientType";
import { ListDirection, GridDirection } from "../enums/layoutDirection";
import { LayoutSize } from "../enums/layoutSize";
import { ScrollbarType } from "../enums/scrollbarType";
import { VerticalAlignment, HorizontalAlignment } from "../enums/alignment";
import { ShadowPosition } from "../enums/shadowPosition";
import { BorderPosition } from "../enums/borderPosition";
import { VerticalAnchor, HorizontalAnchor } from "../enums/anchor";
import { getUnitNumberCSS } from "./getUnitNumberCSS";
import { PositionProps } from "../interfaces/props/positionProps";
import { TransformProps } from "../interfaces/props/transformProps";
import { RadiusProps } from "../interfaces/props/radiusProps";
import { SizeProps } from "../interfaces/props/sizeProps";
import { LayoutProps } from "../interfaces/props/layoutProps";
import { TextProps } from "../interfaces/props/textProps";
import { FillProps } from "../interfaces/props/fillProps";
import { ShadowProps } from "../interfaces/props/shadowProps";
import { GlowProps } from "../interfaces/props/glowProps";
import { BlendingProps } from "../interfaces/props/blendingProps";
import { BorderProps } from "../interfaces/props/borderProps";
import { splitCamelCaseString } from "../../../impower-config";

export const getDisplay = (
  type: ArrangementType
): "flex" | "grid" | undefined => {
  switch (type) {
    case ArrangementType.List:
      return "flex";
    case ArrangementType.Grid:
      return "grid";
    default:
      return undefined;
  }
};

export const getBackgroundColor = (
  type: FillType,
  color: Color
): string | undefined => {
  switch (type) {
    case FillType.Solid:
      return getColorRgbString(color);
    case FillType.Gradient:
      return undefined;
    case FillType.Image:
      return undefined;
    default:
      return undefined;
  }
};

export const getBackgroundImage = (
  type: FillType,
  gradientType: GradientType,
  color: Color,
  gradientAngle: number,
  gradientColorStops: List<{ color: Color; position: UnitNumberData }>,
  imageUrl: string
): string | undefined => {
  switch (type) {
    case FillType.Solid:
      return undefined;
    case FillType.Gradient:
      return `${
        gradientType === GradientType.Linear
          ? `linear-gradient`
          : `radial-gradient`
      }(
          ${gradientAngle}deg,
          ${getColorRgbString(color)} 0%,
          ${gradientColorStops.order.map((id) => {
            const stop = gradientColorStops.data[id];
            return `${getColorRgbString(stop.color)} ${getUnitNumberCSS(
              stop.position
            )},`;
          })}
        )`;
    case FillType.Image:
      return `url(${imageUrl})`;
    default:
      return undefined;
  }
};

export const getFlexDirection = (
  direction: ListDirection
): "column" | "column-reverse" | "row" | "row-reverse" => {
  switch (direction) {
    case ListDirection.Column:
      return "column";
    case ListDirection.ColumnReversed:
      return "column-reverse";
    case ListDirection.Row:
      return "row";
    case ListDirection.RowReversed:
      return "row-reverse";
    default:
      return "column";
  }
};

export const getGridAutoFlow = (direction: GridDirection): "column" | "row" => {
  switch (direction) {
    case GridDirection.Column:
      return "column";
    case GridDirection.Row:
      return "row";
    default:
      return "column";
  }
};

export const getMinWidth = (
  size: LayoutSize,
  width: string
): string | undefined => {
  switch (size) {
    case LayoutSize.Auto:
      return width;
    case LayoutSize.Min:
      return width;
    case LayoutSize.Max:
      return undefined;
    default:
      return undefined;
  }
};

export const getMaxWidth = (
  size: LayoutSize,
  width: string
): string | undefined => {
  switch (size) {
    case LayoutSize.Auto:
      return width;
    case LayoutSize.Min:
      return undefined;
    case LayoutSize.Max:
      return width;
    default:
      return undefined;
  }
};

export const getMinHeight = (
  size: LayoutSize,
  height: string
): string | undefined => {
  switch (size) {
    case LayoutSize.Auto:
      return height;
    case LayoutSize.Min:
      return height;
    case LayoutSize.Max:
      return undefined;
    default:
      return undefined;
  }
};

export const getMaxHeight = (
  size: LayoutSize,
  height: string
): string | undefined => {
  switch (size) {
    case LayoutSize.Auto:
      return height;
    case LayoutSize.Min:
      return undefined;
    case LayoutSize.Max:
      return height;
    default:
      return undefined;
  }
};

export const getOverflow = (scrollbar: ScrollbarType): string | undefined => {
  switch (scrollbar) {
    case ScrollbarType.Auto:
      return "auto";
    case ScrollbarType.Always:
      return "scroll";
    case ScrollbarType.Hidden:
      return "hidden";
    case ScrollbarType.Overflow:
      return "visible";
    default:
      return undefined;
  }
};

export const getJustifyContent = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Column) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "center";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "flex-start";
        case VerticalAlignment.Bottom:
          return "flex-end";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.Row) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "center";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "flex-start";
        case HorizontalAlignment.Right:
          return "flex-end";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.ColumnReversed) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "center";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "flex-end";
        case VerticalAlignment.Bottom:
          return "flex-start";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.RowReversed) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "center";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "flex-end";
        case HorizontalAlignment.Right:
          return "flex-start";
        default:
          return undefined;
      }
    }
  }
  return undefined;
};

export const getJustifyItems = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment
): string | undefined => {
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Column) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "center";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "start";
        case VerticalAlignment.Bottom:
          return "end";
        default:
          return undefined;
      }
    }
    if (direction === GridDirection.Row) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "center";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "start";
        case HorizontalAlignment.Right:
          return "end";
        default:
          return undefined;
      }
    }
  }
  return undefined;
};

export const getAlignItems = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Column) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "stretch";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "flex-start";
        case HorizontalAlignment.Right:
          return "flex-end";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.Row) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "stretch";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "flex-start";
        case VerticalAlignment.Bottom:
          return "flex-end";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.ColumnReversed) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "stretch";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "flex-end";
        case HorizontalAlignment.Right:
          return "flex-start";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.RowReversed) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "stretch";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "flex-end";
        case VerticalAlignment.Bottom:
          return "flex-start";
        default:
          return undefined;
      }
    }
  }
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Column) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "stretch";
        case HorizontalAlignment.Center:
          return "center";
        case HorizontalAlignment.Left:
          return "start";
        case HorizontalAlignment.Right:
          return "end";
        default:
          return undefined;
      }
    }
    if (direction === GridDirection.Row) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "stretch";
        case VerticalAlignment.Middle:
          return "center";
        case VerticalAlignment.Top:
          return "start";
        case VerticalAlignment.Bottom:
          return "end";
        default:
          return undefined;
      }
    }
  }
  return undefined;
};

export const getFlex = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Column) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "1";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.Row) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "1";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.ColumnReversed) {
      switch (verticalAlignment) {
        case VerticalAlignment.Stretch:
          return "1";
        default:
          return undefined;
      }
    }
    if (direction === ListDirection.RowReversed) {
      switch (horizontalAlignment) {
        case HorizontalAlignment.Stretch:
          return "1";
        default:
          return undefined;
      }
    }
  }
  return undefined;
};

export const getMarginTop = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  spaceBetween: number
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Column) {
      return `${spaceBetween * 0.5}px`;
    }
    if (direction === ListDirection.ColumnReversed) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Column) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  return undefined;
};

export const getMarginBottom = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  spaceBetween: number
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Column) {
      return `${spaceBetween * 0.5}px`;
    }
    if (direction === ListDirection.ColumnReversed) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Column) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  return undefined;
};

export const getMarginLeft = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  spaceBetween: number
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Row) {
      return `${spaceBetween * 0.5}px`;
    }
    if (direction === ListDirection.RowReversed) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Row) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  return undefined;
};

export const getMarginRight = (
  childArrangement: ArrangementType,
  direction: ListDirection | GridDirection,
  spaceBetween: number
): string | undefined => {
  if (childArrangement === ArrangementType.List) {
    if (direction === ListDirection.Row) {
      return `${spaceBetween * 0.5}px`;
    }
    if (direction === ListDirection.RowReversed) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  if (childArrangement === ArrangementType.Grid) {
    if (direction === GridDirection.Row) {
      return `${spaceBetween * 0.5}px`;
    }
  }
  return undefined;
};

export const getMaterialBoxShadow = (
  position: ShadowPosition,
  elevation: number
): string | undefined => {
  const inset = position === ShadowPosition.Inside ? "inset " : "";
  switch (elevation) {
    case 1:
      return `${inset}0 1px 1px 0 rgba(0,0,0,0.14), ${inset}0 2px 1px -1px rgba(0,0,0,0.12), ${inset}0 1px 3px 0 rgba(0,0,0,0.20)`;
    case 2:
      return `${inset}0 2px 2px 0 rgba(0,0,0,0.14), ${inset}0 3px 1px -2px rgba(0,0,0,0.12), ${inset}0 1px 5px 0 rgba(0,0,0,0.20)`;
    case 3:
      return `${inset}0 3px 4px 0 rgba(0,0,0,0.14), ${inset}0 3px 3px -2px rgba(0,0,0,0.12), ${inset}0 1px 8px 0 rgba(0,0,0,0.20)`;
    case 4:
      return `${inset}0 4px 5px 0 rgba(0,0,0,0.14), ${inset}0 1px 10px 0 rgba(0,0,0,0.12), ${inset}0 2px 4px -1px rgba(0,0,0,0.20)`;
    case 5:
    case 6:
      return `${inset}0 6px 10px 0 rgba(0,0,0,0.14), ${inset}0 1px 18px 0 rgba(0,0,0,0.12), ${inset}0 3px 5px -1px rgba(0,0,0,0.20)`;
    case 7:
    case 8:
      return `${inset}0 8px 10px 1px rgba(0,0,0,0.14), ${inset}0 3px 14px 2px rgba(0,0,0,0.12), ${inset}0 5px 5px -3px rgba(0,0,0,0.20)`;
    case 9:
    case 10:
    case 11:
    case 12:
      return `${inset}0 12px 17px 2px rgba(0,0,0,0.14), ${inset}0 5px 22px 4px rgba(0,0,0,0.12), ${inset}0 7px 8px -4px rgba(0,0,0,0.20)`;
    case 13:
    case 14:
    case 15:
    case 16:
      return `${inset}0 16px 24px 2px rgba(0,0,0,0.14), ${inset}0 6px 30px 5px rgba(0,0,0,0.12), ${inset}0 8px 10px -5px rgba(0,0,0,0.20)`;
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
    case 22:
    case 23:
    case 24:
      return `${inset}0 24px 38px 3px rgba(0,0,0,0.14), ${inset}0 9px 46px 8px rgba(0,0,0,0.12), ${inset}0 11px 15px -7px rgba(0,0,0,0.20)`;
    default:
      return undefined;
  }
};

export const getBorderBoxShadow = (
  color: Color,
  position: BorderPosition,
  size: number
): string | undefined => {
  const borderColor = getColorRgbString(color);
  if (position === BorderPosition.Inside) {
    return `inset 0 0 0 ${size}px ${borderColor}`;
  }
  if (position === BorderPosition.Center) {
    return `inset 0 0 0 ${size * 0.5}px ${borderColor}, 0 0 0 ${
      size * 0.5
    }px ${borderColor}`;
  }
  if (position === BorderPosition.Outside) {
    return `0 0 0 ${size}px ${borderColor}`;
  }
  return undefined;
};

export const getShadowBoxShadow = (
  position: ShadowPosition,
  elevation: number
): string | undefined => {
  return getMaterialBoxShadow(position, elevation);
};

export const getGlowBoxShadow = (
  position: ShadowPosition,
  color: Color,
  blur: number,
  spread: number,
  x: number,
  y: number
): string | undefined => {
  const borderColor = getColorRgbString(color);
  if (position === ShadowPosition.Inside) {
    return `inset ${x}px ${y}px ${blur}px ${spread}px ${borderColor}`;
  }
  if (position === ShadowPosition.Outside) {
    return `${x}px ${y}px ${blur}px ${spread}px ${borderColor}`;
  }
  return undefined;
};

export const getParentPositionStyle = (
  position?: PositionProps
): {
  position?: string;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
} => {
  if (!position) {
    return {};
  }
  const { verticalAnchor, horizontalAnchor, top, bottom, left, right } =
    position;
  return {
    position: "absolute",
    top:
      verticalAnchor === VerticalAnchor.Top ||
      verticalAnchor === VerticalAnchor.TopAndBottom
        ? getUnitNumberCSS(top)
        : undefined,
    bottom:
      verticalAnchor === VerticalAnchor.Bottom ||
      verticalAnchor === VerticalAnchor.TopAndBottom
        ? getUnitNumberCSS(bottom)
        : undefined,
    left:
      horizontalAnchor === HorizontalAnchor.Left ||
      horizontalAnchor === HorizontalAnchor.LeftAndRight
        ? getUnitNumberCSS(left)
        : undefined,
    right:
      horizontalAnchor === HorizontalAnchor.Right ||
      horizontalAnchor === HorizontalAnchor.LeftAndRight
        ? getUnitNumberCSS(right)
        : undefined,
  };
};

export const getParentTransformStyle = (
  transform: TransformProps
): { transform?: string; transformOrigin?: string } => {
  const { rotation, offset, scale, skew, origin } = transform;
  const originX = getUnitNumberCSS(origin.x);
  const originY = getUnitNumberCSS(origin.y);
  const transformArray: string[] = [];
  if (offset.x !== 0 || offset.y !== 0) {
    transformArray.push(`translate(${offset.x}px,${offset.y}px)`);
  }
  if (rotation > 0) {
    transformArray.push(`rotate(${rotation}deg)`);
  }
  if (scale.x > 1 || scale.y > 1) {
    transformArray.push(`scale(${scale.x},${scale.y})`);
  }
  if (skew.x > 0 || skew.y > 0) {
    transformArray.push(`skew(${skew.x}deg,${skew.y}deg)`);
  }
  if (transformArray.length > 0) {
    // Force GPU to speed up animations and transitions
    transformArray.push(`rotateZ(360deg)`);
  }
  const transformOrigin =
    transformArray.length > 0 ? `${originX} ${originY}` : undefined;
  return {
    transform: transformArray.join(" "),
    transformOrigin,
  };
};

export const getParentBorderRadiusStyle = (
  radius: RadiusProps
): {
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomRightRadius?: string;
  borderBottomLeftRadius?: string;
} => {
  const {
    topLeft: topLeftUnit,
    topRight: topRightUnit,
    bottomLeft: bottomLeftUnit,
    bottomRight: bottomRightUnit,
  } = radius;
  const borderTopLeftRadius = getUnitNumberCSS(topLeftUnit);
  const borderTopRightRadius = getUnitNumberCSS(topRightUnit);
  const borderBottomRightRadius = getUnitNumberCSS(bottomRightUnit);
  const borderBottomLeftRadius = getUnitNumberCSS(bottomLeftUnit);
  return {
    borderTopLeftRadius,
    borderTopRightRadius,
    borderBottomRightRadius,
    borderBottomLeftRadius,
  };
};

export const getParentLayoutStyle = (
  layout: LayoutProps,
  size?: SizeProps
): {
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  overflowX?: string;
  overflowY?: string;
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
} => {
  const { width, height, verticalScrollbar, horizontalScrollbar } = layout;
  const minWidth = size
    ? getMinWidth(width, getUnitNumberCSS(size.width))
    : undefined;
  const minHeight = size
    ? getMinHeight(height, getUnitNumberCSS(size.height))
    : undefined;
  const maxWidth = size
    ? getMinWidth(width, getUnitNumberCSS(size.width))
    : undefined;
  const maxHeight = size
    ? getMinHeight(height, getUnitNumberCSS(size.height))
    : undefined;
  const overflowX = getOverflow(horizontalScrollbar);
  const overflowY = getOverflow(verticalScrollbar);
  const display = "flex";
  const flexDirection = "column";
  const justifyContent = "center";
  const alignItems = "center";
  return {
    display,
    overflowX,
    overflowY,
    flexDirection,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    justifyContent,
    alignItems,
  };
};

export const getParentTextStyle = (
  text: TextProps
): {
  fontFamily?: string;
  fontSize?: string;
  textAlign?: string;
  lineHeight?: string;
  letterSpacing?: string;
  whiteSpace?: string;
} => {
  const { fontFamily, alignment, size, lineHeight, letterSpacing, wrap } = text;
  const textAlign = alignment.toLowerCase();
  const fontSize = `${size}px`;
  const whiteSpace = wrap ? "pre" : "nowrap";
  return {
    fontFamily,
    fontSize,
    textAlign,
    lineHeight: `${lineHeight}`,
    letterSpacing: `${letterSpacing}px`,
    whiteSpace,
  };
};

export const getParentBackgroundColorStyle = (
  fill: FillProps
): { backgroundColor?: string } => {
  const { type, color } = fill;
  const backgroundColor = getBackgroundColor(type, color);
  return {
    backgroundColor,
  };
};

export const getParentBackgroundImageStyle = (
  fill: FillProps,
  imageFileUrls: { [id: string]: string }
): { backgroundImage?: string } => {
  const {
    type,
    gradientType,
    color,
    gradientAngle,
    gradientColorStops,
    image,
  } = fill;
  const backgroundImage = getBackgroundImage(
    type,
    gradientType,
    color,
    gradientAngle,
    gradientColorStops,
    imageFileUrls[image.refId]
  );
  return {
    backgroundImage,
  };
};

export const getParentBackgroundImageSizeStyle = (): {
  backgroundSize?: string;
} => {
  const backgroundSize = "contain";
  return {
    backgroundSize,
  };
};

export const getParentBackgroundImageRepeatStyle = (): {
  backgroundRepeat?: string;
} => {
  const backgroundRepeat = "no-repeat";
  return {
    backgroundRepeat,
  };
};

export const getParentBackgroundImagePositionStyle = (): {
  backgroundPosition?: string;
} => {
  const backgroundPosition = "center";
  return {
    backgroundPosition,
  };
};

export const getParentBorderStyle = (
  border: BorderProps
): { borderStyle?: string; borderColor?: string; boxShadow?: string } => {
  const { color, position, size } = border;
  const boxShadow = getBorderBoxShadow(color, position, size);
  return {
    boxShadow,
  };
};

export const getParentShadowStyle = (
  shadow: ShadowProps
): { boxShadow?: string } => {
  const { position, elevation } = shadow;
  const boxShadow = getShadowBoxShadow(position, elevation);
  return {
    boxShadow,
  };
};

export const getParentGlowStyle = (glow: GlowProps): { boxShadow?: string } => {
  const { position, color, blur, spread, x, y } = glow;
  const boxShadow = getGlowBoxShadow(position, color, blur, spread, x, y);
  return {
    boxShadow,
  };
};

export const getParentOpacityStyle = (
  blending: BlendingProps
): { opacity?: string } => {
  const { opacity } = blending;
  return {
    opacity: opacity.toString(),
  };
};

export const getParentMixBlendModeStyle = (
  blending: BlendingProps
): { mixBlendMode?: string } => {
  const { mode } = blending;
  const mixBlendMode = splitCamelCaseString(mode, "-").toLowerCase();
  return {
    mixBlendMode,
  };
};

export const getChildrenLayoutStyle = (
  layout: LayoutProps,
  hasChildren: boolean
): {
  display?: string;
  flexDirection?: string;
  gridAutoFlow?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  justifyContent?: string;
  justifyItems?: string;
  alignItems?: string;
  margin?: string;
} => {
  const {
    childArrangement,
    direction,
    verticalAlignment,
    horizontalAlignment,
    minColumnCount,
    minRowCount,
    spaceAround,
    spaceBetween,
  } = layout;
  const display = getDisplay(childArrangement);
  const flexDirection =
    childArrangement === ArrangementType.List
      ? getFlexDirection(direction as ListDirection)
      : undefined;
  const gridAutoFlow =
    childArrangement === ArrangementType.Grid
      ? getGridAutoFlow(direction as GridDirection)
      : undefined;
  const gridTemplateColumns =
    childArrangement === ArrangementType.Grid && minColumnCount.active
      ? `repeat(${minColumnCount.value}, 1fr)`
      : undefined;
  const gridTemplateRows =
    childArrangement === ArrangementType.Grid && minRowCount.active
      ? `repeat(${minRowCount.value}, 1fr)`
      : undefined;
  const justifyContent = getJustifyContent(
    childArrangement,
    direction,
    verticalAlignment,
    horizontalAlignment
  );
  const justifyItems = getJustifyItems(
    childArrangement,
    direction,
    verticalAlignment,
    horizontalAlignment
  );
  const alignItems = getAlignItems(
    childArrangement,
    direction,
    verticalAlignment,
    horizontalAlignment
  );
  const childMargin = hasChildren ? spaceBetween * 0.5 : 0;
  const margin = `${spaceAround - childMargin}px`;
  return {
    display,
    flexDirection,
    gridAutoFlow,
    gridTemplateColumns,
    gridTemplateRows,
    justifyContent,
    justifyItems,
    alignItems,
    margin,
  };
};

export const getChildLayoutStyle = (
  layout: LayoutProps
): {
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  flex?: string;
} => {
  const {
    childArrangement,
    direction,
    spaceBetween,
    verticalAlignment,
    horizontalAlignment,
  } = layout;
  const marginTop = getMarginTop(childArrangement, direction, spaceBetween);
  const marginBottom = getMarginBottom(
    childArrangement,
    direction,
    spaceBetween
  );
  const marginLeft = getMarginLeft(childArrangement, direction, spaceBetween);
  const marginRight = getMarginRight(childArrangement, direction, spaceBetween);
  const flex = getFlex(
    childArrangement,
    direction,
    verticalAlignment,
    horizontalAlignment
  );
  return {
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    flex,
  };
};
