import getCssAnimation from "../utils/getCssAnimation.js";
import getCssBgAlign from "../utils/getCssBgAlign.js";
import getCssBgFit from "../utils/getCssBgFit.js";
import getCssBlend from "../utils/getCssBlend.js";
import getCssBorderStyle from "../utils/getCssBorderStyle.js";
import getCssChildAlign from "../utils/getCssChildAlign.js";
import getCssChildJustify from "../utils/getCssChildJustify.js";
import getCssChildLayout from "../utils/getCssChildLayout.js";
import getCssChildOverflow from "../utils/getCssChildOverflow.js";
import getCssColor from "../utils/getCssColor.js";
import getCssCorner from "../utils/getCssCorner.js";
import getCssDimension from "../utils/getCssDimension.js";
import getCssDuration from "../utils/getCssDuration.js";
import getCssEase from "../utils/getCssEase.js";
import getCssFilter from "../utils/getCssFilter.js";
import getCssGradient from "../utils/getCssGradient.js";
import getCssGrow from "../utils/getCssGrow.js";
import getCssImage from "../utils/getCssImage.js";
import getCssInteractable from "../utils/getCssInteractable.js";
import getCssInvisible from "../utils/getCssInvisible.js";
import getCssMask from "../utils/getCssMask.js";
import getCssOutlineStyle from "../utils/getCssOutlineStyle.js";
import getCssOverflow from "../utils/getCssOverflow.js";
import getCssPattern from "../utils/getCssPattern.js";
import getCssPosition from "../utils/getCssPosition.js";
import getCssRatio from "../utils/getCssRatio.js";
import getCssRepeat from "../utils/getCssRepeat.js";
import getCssRotate from "../utils/getCssRotate.js";
import getCssScale from "../utils/getCssScale.js";
import getCssSelectable from "../utils/getCssSelectable.js";
import getCssShadow from "../utils/getCssShadow.js";
import getCssShadowInset from "../utils/getCssShadowInset.js";
import getCssShrink from "../utils/getCssShrink.js";
import getCssSize from "../utils/getCssSize.js";
import getCssSkew from "../utils/getCssSkew.js";
import getCssTextAlign from "../utils/getCssTextAlign.js";
import getCssTextFont from "../utils/getCssTextFont.js";
import getCssTextItalic from "../utils/getCssTextItalic.js";
import getCssTextLeading from "../utils/getCssTextLeading.js";
import getCssTextOverflow from "../utils/getCssTextOverflow.js";
import getCssTextSize from "../utils/getCssTextSize.js";
import getCssTextStrikethrough from "../utils/getCssTextStrikethrough.js";
import getCssTextUnderline from "../utils/getCssTextUnderline.js";
import getCssTextWeight from "../utils/getCssTextWeight.js";
import getCssTextWhitespace from "../utils/getCssTextWhitespace.js";
import getCssTranslate from "../utils/getCssTranslate.js";
import getCssZ from "../utils/getCssZ.js";

const get = (v: string) => v;

const STYLE_TRANSFORMERS = {
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

  "outline-width": getCssSize,
  "outline-color": getCssColor,
  "outline-style": getCssOutlineStyle,

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
  "border-style": getCssBorderStyle,
  "border-style-t": getCssBorderStyle,
  "border-style-r": getCssBorderStyle,
  "border-style-b": getCssBorderStyle,
  "border-style-l": getCssBorderStyle,
  "border-style-lr": getCssBorderStyle,
  "border-style-tb": getCssBorderStyle,

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
  "text-whitespace": getCssTextWhitespace,
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
  "rotate-x": get,
  "rotate-y": get,
  "rotate-z": get,
  rotate: getCssRotate,
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
  exit: getCssAnimation,
  enter: getCssAnimation,
} as const;

export default STYLE_TRANSFORMERS;
