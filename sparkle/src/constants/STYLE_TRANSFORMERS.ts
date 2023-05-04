import { getCssAnimation } from "../utils/getCssAnimation";
import { getCssBgAlign } from "../utils/getCssBgAlign";
import { getCssBgFit } from "../utils/getCssBgFit";
import { getCssBlend } from "../utils/getCssBlend";
import { getCssBlur } from "../utils/getCssBlur";
import { getCssBrightness } from "../utils/getCssBrightness";
import { getCssChildAlign } from "../utils/getCssChildAlign";
import { getCssChildJustify } from "../utils/getCssChildJustify";
import { getCssChildLayout } from "../utils/getCssChildLayout";
import { getCssChildOverflow } from "../utils/getCssChildOverflow";
import { getCssClip } from "../utils/getCssClip";
import { getCssColor } from "../utils/getCssColor";
import { getCssContrast } from "../utils/getCssContrast";
import { getCssCorner } from "../utils/getCssCorner";
import { getCssDimension } from "../utils/getCssDimension";
import { getCssDuration } from "../utils/getCssDuration";
import { getCssEase } from "../utils/getCssEase";
import { getCssGradient } from "../utils/getCssGradient";
import { getCssGrayscale } from "../utils/getCssGrayscale";
import { getCssGrow } from "../utils/getCssGrow";
import { getCssHue } from "../utils/getCssHue";
import { getCssImage } from "../utils/getCssImage";
import { getCssInteractable } from "../utils/getCssInteractable";
import { getCssInvert } from "../utils/getCssInvert";
import { getCssInvisible } from "../utils/getCssInvisible";
import { getCssOverflow } from "../utils/getCssOverflow";
import { getCssPattern } from "../utils/getCssPattern";
import { getCssPosition } from "../utils/getCssPosition";
import { getCssRatio } from "../utils/getCssRatio";
import { getCssRepeat } from "../utils/getCssRepeat";
import { getCssRotate } from "../utils/getCssRotate";
import { getCssSaturate } from "../utils/getCssSaturate";
import { getCssScale } from "../utils/getCssScale";
import { getCssSelectable } from "../utils/getCssSelectable";
import { getCssSepia } from "../utils/getCssSepia";
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

const get = (v: string) => v;

export const STYLE_TRANSFORMERS: Record<string, (v: string) => string> = {
  position: getCssPosition,

  aspect: getCssRatio,

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

  "bg-color": getCssColor,
  "bg-gradient": getCssGradient,
  "bg-pattern": getCssPattern,
  "bg-image": getCssImage,
  "bg-repeat": getCssRepeat,
  "bg-align": getCssBgAlign,
  "bg-fit": getCssBgFit,

  clip: getCssClip,

  "border-color": getCssColor,
  "border-width": getCssSize,

  shadow: getCssShadow,
  "shadow-inset": getCssShadowInset,

  blur: getCssBlur,
  brightness: getCssBrightness,
  contrast: getCssContrast,
  grayscale: getCssGrayscale,
  hue: getCssHue,
  invert: getCssInvert,
  sepia: getCssSepia,
  saturate: getCssSaturate,

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

  animate: getCssAnimation,
};
