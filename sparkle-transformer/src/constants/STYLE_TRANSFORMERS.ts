import { getCssAnimation } from "../utils/getCssAnimation";
import { getCssAspectRatio } from "../utils/getCssAspectRatio";
import { getCssBgAlign } from "../utils/getCssBgAlign";
import { getCssBgFit } from "../utils/getCssBgFit";
import { getCssBlend } from "../utils/getCssBlend";
import { getCssChildAlign } from "../utils/getCssChildAlign";
import { getCssChildJustify } from "../utils/getCssChildJustify";
import { getCssChildLayout } from "../utils/getCssChildLayout";
import { getCssChildOverflow } from "../utils/getCssChildOverflow";
import { getCssColor } from "../utils/getCssColor";
import { getCssCorner } from "../utils/getCssCorner";
import { getCssDimension } from "../utils/getCssDimension";
import { getCssDuration } from "../utils/getCssDuration";
import { getCssEase } from "../utils/getCssEase";
import { getCssFilter } from "../utils/getCssFilter";
import { getCssGradient } from "../utils/getCssGradient";
import { getCssGrow } from "../utils/getCssGrow";
import { getCssImage } from "../utils/getCssImage";
import { getCssInteractable } from "../utils/getCssInteractable";
import { getCssInvisible } from "../utils/getCssInvisible";
import { getCssMask } from "../utils/getCssMask";
import { getCssOverflow } from "../utils/getCssOverflow";
import { getCssPattern } from "../utils/getCssPattern";
import { getCssPosition } from "../utils/getCssPosition";
import { getCssRepeat } from "../utils/getCssRepeat";
import { getCssRotate } from "../utils/getCssRotate";
import { getCssScale } from "../utils/getCssScale";
import { getCssSelectable } from "../utils/getCssSelectable";
import { getCssShadow } from "../utils/getCssShadow";
import { getCssShadowInset } from "../utils/getCssShadowInset";
import { getCssShrink } from "../utils/getCssShrink";
import { getCssSize } from "../utils/getCssSize";
import { getCssSkew } from "../utils/getCssSkew";
import { getCssTextAlign } from "../utils/getCssTextAlign";
import { getCssTextFont } from "../utils/getCssTextFont";
import { getCssTextItalic } from "../utils/getCssTextItalic";
import { getCssTextLeading } from "../utils/getCssTextLeading";
import { getCssTextOverflow } from "../utils/getCssTextOverflow";
import { getCssTextSize } from "../utils/getCssTextSize";
import { getCssTextStrikethrough } from "../utils/getCssTextStrikethrough";
import { getCssTextUnderline } from "../utils/getCssTextUnderline";
import { getCssTextWeight } from "../utils/getCssTextWeight";
import { getCssTranslate } from "../utils/getCssTranslate";
import { getCssZ } from "../utils/getCssZ";

export const get = (v: string) => v;

export const STYLE_TRANSFORMERS = {
  position: getCssPosition,

  aspect: getCssAspectRatio,

  "overflow-x": getCssOverflow,
  "overflow-y": getCssOverflow,

  z: getCssZ,

  width: getCssDimension,
  "width-min": getCssDimension,
  "width-max": getCssDimension,

  height: getCssDimension,
  "height-min": getCssDimension,
  "height-max": getCssDimension,

  corner: getCssCorner,
  "corner-t": getCssCorner,
  "corner-r": getCssCorner,
  "corner-b": getCssCorner,
  "corner-l": getCssCorner,
  "corner-tl": getCssCorner,
  "corner-tr": getCssCorner,
  "corner-br": getCssCorner,
  "corner-bl": getCssCorner,

  inset: getCssSize,
  "inset-t": getCssSize,
  "inset-r": getCssSize,
  "inset-b": getCssSize,
  "inset-l": getCssSize,
  "inset-lr": getCssSize,
  "inset-tb": getCssSize,

  "outline-width": getCssSize,
  "outline-width-t": getCssSize,
  "outline-width-r": getCssSize,
  "outline-width-b": getCssSize,
  "outline-width-l": getCssSize,
  "outline-width-lr": getCssSize,
  "outline-width-tb": getCssSize,
  "outline-color": getCssColor,
  "outline-color-t": getCssColor,
  "outline-color-r": getCssColor,
  "outline-color-b": getCssColor,
  "outline-color-l": getCssColor,
  "outline-color-lr": getCssColor,
  "outline-color-tb": getCssColor,

  "border-width": getCssSize,
  "border-width-t": getCssSize,
  "border-width-r": getCssSize,
  "border-width-b": getCssSize,
  "border-width-l": getCssSize,
  "border-width-lr": getCssSize,
  "border-width-tb": getCssSize,
  "border-color": getCssColor,
  "border-color-t": getCssColor,
  "border-color-r": getCssColor,
  "border-color-b": getCssColor,
  "border-color-l": getCssColor,
  "border-color-lr": getCssColor,
  "border-color-tb": getCssColor,

  margin: getCssSize,
  "margin-t": getCssSize,
  "margin-r": getCssSize,
  "margin-b": getCssSize,
  "margin-l": getCssSize,
  "margin-lr": getCssSize,
  "margin-tb": getCssSize,

  padding: getCssSize,
  "padding-t": getCssSize,
  "padding-r": getCssSize,
  "padding-b": getCssSize,
  "padding-l": getCssSize,
  "padding-lr": getCssSize,
  "padding-tb": getCssSize,

  "child-layout": getCssChildLayout,
  "child-gap": getCssSize,
  "child-align": getCssChildAlign,
  "child-justify": getCssChildJustify,
  "child-overflow": getCssChildOverflow,
  "self-align": getCssChildAlign,

  grow: getCssGrow,
  shrink: getCssShrink,

  invisible: getCssInvisible,
  interactable: getCssInteractable,
  selectable: getCssSelectable,

  color: getCssColor,

  "text-font": getCssTextFont,
  "text-size": getCssTextSize,
  "text-leading": getCssTextLeading,
  "text-kerning": get,
  "text-weight": getCssTextWeight,
  "text-italic": getCssTextItalic,
  "text-underline": getCssTextUnderline,
  "text-strikethrough": getCssTextStrikethrough,
  "text-case": get,
  "text-align": getCssTextAlign,
  "text-overflow": getCssTextOverflow,
  "text-color": getCssColor,
  "text-stroke-color": getCssColor,
  "text-stroke-width": get,
  "text-underline-offset": getCssSize,
  "text-decoration-thickness": getCssSize,

  "background-color": getCssColor,
  "background-gradient": getCssGradient,
  "background-pattern": getCssPattern,
  "background-image": getCssImage,
  "background-repeat": getCssRepeat,
  "background-align": getCssBgAlign,
  "background-fit": getCssBgFit,

  mask: getCssMask,

  shadow: getCssShadow,
  "shadow-inset": getCssShadowInset,

  filter: getCssFilter,

  blend: getCssBlend,

  opacity: get,

  "translate-x": getCssTranslate,
  "translate-y": getCssTranslate,
  "translate-z": getCssTranslate,
  "rotate-x": getCssRotate,
  "rotate-y": getCssRotate,
  "rotate-z": getCssRotate,
  "scale-x": getCssScale,
  "scale-y": getCssScale,
  "scale-z": getCssScale,
  "skew-x": getCssSkew,
  "skew-y": getCssSkew,

  pivot: get,

  delay: getCssDuration,
  duration: getCssDuration,
  ease: getCssEase,

  animation: getCssAnimation,
} as const;
