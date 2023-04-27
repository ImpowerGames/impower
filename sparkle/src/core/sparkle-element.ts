import { dispatchActivationClick, isActivationClick } from "../utils/events";
import { pointerPress, shouldShowStrongFocus } from "../utils/focus";
import { getCssAnimation } from "../utils/getCssAnimation";
import { getCssBgAlign } from "../utils/getCssBgAlign";
import { getCssBgFit } from "../utils/getCssBgFit";
import { getCssClip } from "../utils/getCssClip";
import { getCssColor } from "../utils/getCssColor";
import { getCssCorner } from "../utils/getCssCorner";
import { getCssDuration } from "../utils/getCssDuration";
import { getCssEase } from "../utils/getCssEase";
import { getCssGradient } from "../utils/getCssGradient";
import { getCssImage } from "../utils/getCssImage";
import { getCssJustify } from "../utils/getCssJustify";
import { getCssLayoutAlign } from "../utils/getCssLayoutAlign";
import { getCssPattern } from "../utils/getCssPattern";
import { getCssPosition } from "../utils/getCssPosition";
import { getCssRatio } from "../utils/getCssRatio";
import { getCssRepeat } from "../utils/getCssRepeat";
import { getCssShadow } from "../utils/getCssShadow";
import { getCssShadowInset } from "../utils/getCssShadowInset";
import { getCssSize } from "../utils/getCssSize";
import { getCssTextAlign } from "../utils/getCssTextAlign";
import { getCssTextFont } from "../utils/getCssTextFont";
import { getCssTextLeading } from "../utils/getCssTextLeading";
import { getCssTextSize } from "../utils/getCssTextSize";
import { getCssTextSizeHeight } from "../utils/getCssTextSizeHeight";
import { getCssTextStrikethrough } from "../utils/getCssTextStrikethrough";
import { getCssTextStroke } from "../utils/getCssTextStroke";
import { getCssTextUnderline } from "../utils/getCssTextUnderline";
import { getCssTextWeight } from "../utils/getCssTextWeight";
import { getCssTextWrap } from "../utils/getCssTextWrap";
import { isServer } from "../utils/isServer";
import { updateAttribute } from "../utils/updates";
import css from "./sparkle-element.css";
import html from "./sparkle-element.html";

const get = (v: string) => v;

export const STYLE_TRANSFORMERS: Record<string, (v: string) => string> = {
  position: getCssPosition,

  aspect: getCssRatio,

  "scroll-x": get,
  "scroll-y": get,

  z: getCssSize,

  width: getCssSize,
  "width-min": getCssSize,
  "width-max": getCssSize,

  height: getCssSize,
  "height-min": getCssSize,
  "height-max": getCssSize,

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

  layout: get,
  "layout-align": getCssLayoutAlign,
  "layout-justify": getCssJustify,
  "layout-wrap": get,

  expand: get,

  invisible: get,
  interactable: get,
  selectable: get,

  color: getCssColor,

  "text-font": getCssTextFont,
  "text-size": getCssTextSize,
  "text-leading": getCssTextLeading,
  "text-kerning": get,
  "text-weight": getCssTextWeight,
  "text-italic": get,
  "text-underline": getCssTextUnderline,
  "text-strikethrough": getCssTextStrikethrough,
  "text-case": get,
  "text-align": getCssTextAlign,
  "text-wrap": getCssTextWrap,
  "text-color": getCssColor,
  "text-stroke-color": get,
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

  blur: get,
  brightness: get,
  contrast: get,
  grayscale: get,
  hue: get,
  invert: get,
  sepia: get,
  saturate: get,

  blend: get,

  opacity: get,

  "translate-x": get,
  "translate-y": get,
  "translate-z": get,
  "rotate-x": get,
  "rotate-y": get,
  "rotate-z": get,
  "scale-x": get,
  "scale-y": get,
  "scale-z": get,
  "skew-x": get,
  "skew-y": get,

  pivot: get,

  delay: getCssDuration,
  duration: getCssDuration,
  ease: getCssEase,

  animate: getCssAnimation,
};

const aliases: Record<string, string> = {
  c: "corner",
  "c-t": "corner-t",
  "c-r": "corner-r",
  "c-b": "corner-b",
  "c-l": "corner-l",
  "c-tl": "corner-tl",
  "c-tr": "corner-tr",
  "c-br": "corner-br",
  "c-bl": "corner-bl",
  i: "inset",
  "i-t": "inset-t",
  "i-r": "inset-r",
  "i-b": "inset-b",
  "i-l": "inset-l",
  "i-lr": "inset-lr",
  "i-tb": "inset-tb",
  m: "margin",
  "m-t": "margin-t",
  "m-r": "margin-r",
  "m-b": "margin-b",
  "m-l": "margin-l",
  "m-lr": "margin-lr",
  "m-tb": "margin-tb",
  p: "padding",
  "p-t": "padding-t",
  "p-r": "padding-r",
  "p-b": "padding-b",
  "p-l": "padding-l",
  "p-lr": "padding-lr",
  "p-tb": "padding-tb",
};

const GLOBAL_ATTRIBUTES = [
  "aria-label",
  "disabled",
  "loading",
  ...Object.keys(STYLE_TRANSFORMERS),
  ...Object.keys(aliases),
];

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export default class SparkleElement extends HTMLElement {
  get styles(): CSSStyleSheet[] {
    return [];
  }

  get html(): string {
    return html;
  }

  get root(): HTMLElement {
    return this.shadowRoot?.firstElementChild as HTMLElement;
  }

  static get observedAttributes() {
    return GLOBAL_ATTRIBUTES;
  }

  /**
   * Whether or not the element is disabled.
   */
  get disabled(): boolean {
    return this.getBooleanAttribute("disabled");
  }

  /**
   * Whether or not the element is loading.
   */
  get loading(): boolean {
    return this.getBooleanAttribute("loading");
  }

  /**
   * Sets how this element is positioned in a document.
   */
  get _position():
    | "default"
    | "relative"
    | "fixed"
    | "absolute"
    | "sticky"
    | null {
    return this.getStringAttribute("position");
  }

  /**
   * Sets a preferred aspect ratio for the box.
   */
  get _aspect(): "1/1" | "16/9" | "9/16" | "4/5" | "2/3" | "2/1" | null {
    return this.getStringAttribute("aspect");
  }

  /**
   * Sets the desired behavior when content does not fit in the parent element box (overflows) in the horizontal direction.
   */
  get _scrollX(): "visible" | "clip" | "scroll" | null {
    return this.getStringAttribute("scroll-x");
  }

  /**
   * Sets the desired behavior when content does not fit in the parent element box (overflows) in the vertical direction.
   */
  get _scrollY(): "visible" | "clip" | "scroll" | null {
    return this.getStringAttribute("scroll-y");
  }

  /**
   * Sets the z-order of a positioned element and its descendants or flex items. Overlapping elements with a larger z-index cover those with a smaller one.
   */
  get _z(): "0" | "1" | "2" | "3" | "4" | "5" | null {
    return this.getStringAttribute("z");
  }

  /**
   * Sets this element's width.
   */
  get _width(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("width");
  }

  /**
   * Sets the minimum width of this element. It prevents the used value of the width property from becoming smaller than the value specified.
   */
  get _widthMin(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("width-min");
  }

  /**
   * Sets the maximum width of this element. It prevents the used value of the width property from becoming larger than the value specified.
   */
  get _widthMax(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("width-max");
  }

  /**
   * Sets this element's height.
   */
  get _height(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("height");
  }

  /**
   * Sets the minimum height of this element. It prevents the used value of the height property from becoming smaller than the value specified.
   */
  get _heightMin(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("height-min");
  }

  /**
   * Sets the maximum height of this element. It prevents the used value of the height property from becoming larger than the value specified.
   */
  get _heightMax(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("height-max");
  }

  /**
   * Rounds the corners of this element's outer edge. You can set a radius to make circular corners.
   */
  get _corner(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner");
  }

  /**
   * Rounds the top-left and top-right corners of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerT(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-t");
  }

  /**
   * Rounds the top-right and bottom-right corners of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-r");
  }

  /**
   * Rounds the bottom-left and bottom-right corners of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerB(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-b");
  }

  /**
   * Rounds the top-left and bottom-left corners of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-l");
  }

  /**
   * Rounds the top-left corner of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerTL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-tl");
  }

  /**
   * Rounds the top-right corner of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerTR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-tr");
  }

  /**
   * Rounds the bottom-right corner of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerBR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-br");
  }

  /**
   * Rounds the bottom-left corner of this element by specifying the radius of the circle defining the curvature of the corner.
   */
  get _cornerBL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-bl");
  }

  /**
   * Rounds the corners of this element's outer edge. You can set a radius to make circular corners.
   */
  get _inset(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset");
  }

  /**
   * Sets how far the top edge of this element is from the top edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-t");
  }

  /**
   * Sets how far the right edge of this element is from the right edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-r");
  }

  /**
   * Sets how far the bottom edge of this element is from the bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-b");
  }

  /**
   * Sets how far the left edge of this element is from the left edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-l");
  }

  /**
   * Sets how far the left and right edge of this element is from the left and right edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-lr");
  }

  /**
   * Sets how far the top and bottom edge of this element is from the top and bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   */
  get _insetTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-tb");
  }

  /**
   * Sets the margin area around this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _margin(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin");
  }

  /**
   * Sets the margin area on top of this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-t");
  }

  /**
   * Sets the margin area on the right side of this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-r");
  }

  /**
   * Sets the margin area below this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-b");
  }

  /**
   * Sets the margin area on the left side of this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-l");
  }

  /**
   * Sets the margin area on the left and right sides of this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-lr");
  }

  /**
   * Sets the margin area below and above this element. A positive value places it farther from its neighbors, while a negative value places it closer.
   */
  get _marginTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-tb");
  }

  /**
   * Sets the padding area around this element.
   */
  get _padding(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding");
  }

  /**
   * Sets the padding area on top of this element.
   */
  get _paddingT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-t");
  }

  /**
   * Sets the padding area on the right side of this element.
   */
  get _paddingR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-r");
  }

  /**
   * Sets the padding area below this element.
   */
  get _paddingB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-b");
  }

  /**
   * Sets the padding area on the left side of this element.
   */
  get _paddingL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-l");
  }

  /**
   * Sets the padding area on the left and right sides of this element.
   */
  get _paddingLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-lr");
  }

  /**
   * Sets the padding area above and below this element.
   */
  get _paddingTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-tb");
  }

  /**
   * Sets the layout of this element so that its children are arranged in either a row or column.
   */
  get _layout(): "row" | "column" | "row-reverse" | "column-reverse" | null {
    return this.getStringAttribute("layout");
  }

  /**
   * When this element's children are arranged in a column (layout="column"), this controls their horizontal alignment.
   * When this element's children are arranged in a row (layout="row"), this controls their vertical alignment.
   *
   * If not provided a value, it will use "center"
   */
  get _layoutAlign(): "" | "stretch" | "center" | "start" | "end" | null {
    return this.getStringAttribute("layout-align");
  }

  /**
   * When this element's children are arranged in a column (layout="column"), this controls their vertical alignment.
   * When this element's children are arranged in a row (layout="row"), this controls their horizontal alignment.
   */
  get _layoutJustify():
    | "stretch"
    | "center"
    | "start"
    | "end"
    | "between"
    | "around"
    | "evenly"
    | null {
    return this.getStringAttribute("layout-justify");
  }

  /**
   * Sets whether children are forced onto one line or can wrap onto multiple lines. If wrapping is allowed, it sets the direction that lines are stacked.
   *
   * If not provided a value, it will use "wrap".
   */
  get _layoutWrap(): "" | "nowrap" | "wrap" | "wrap-reverse" | null {
    return this.getStringAttribute("layout-justify");
  }

  /**
   * Sets how much this element will expand to fill the space available in its parent container.
   *
   * If 0, the element will not expand.
   * If 1, the element will expand to fill all available space.
   *
   * If not provided a value, it will use "1".
   */
  get _expand(): "" | "0" | "1" | "2" | "3" | "4" | null {
    return this.getStringAttribute("expand");
  }

  /**
   * Hides this element without affecting layout.
   */
  get _invisible(): "" | null {
    return this.getStringAttribute("invisible");
  }

  /**
   * Allows this element to capture pointer events.
   */
  get _interactable(): "" | null {
    return this.getStringAttribute("interactable");
  }

  /**
   * Allows the user to select this element's text.
   */
  get _selectable(): "" | null {
    return this.getStringAttribute("selectable");
  }

  /**
   * Sets the main color of the content rendered inside this element.
   */
  get _color():
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
    | null {
    return this.getStringAttribute("color");
  }

  /**
   * Specifies which font this element will use to render text.
   */
  get _textFont(): "sans" | "serif" | "mono" | null {
    return this.getStringAttribute("text-font");
  }

  /**
   * Sets the size of this element's font.
   */
  get _textSize():
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
    | "9xl"
    | null {
    return this.getStringAttribute("text-size");
  }

  /**
   * Sets the height of a line of text.
   * It's commonly used to set the distance between lines of text.
   */
  get _textLeading(): "none" | "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-leading");
  }

  /**
   * Sets the letter spacing of text.
   * This value is added to the font's natural letter spacing.
   * Positive values cause letters to spread farther apart, while negative values bring letters closer together.
   */
  get _textKerning(): "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | null {
    return this.getStringAttribute("text-kerning");
  }

  /**
   * Sets the weight (or boldness) of the font.
   */
  get _textWeight():
    | "thin"
    | "extralight"
    | "light"
    | "normal"
    | "medium"
    | "semibold"
    | "bold"
    | "extrabold"
    | "black"
    | null {
    return this.getStringAttribute("text-weight");
  }

  /**
   * Makes text italic.
   */
  get _textItalic(): "" | null {
    return this.getStringAttribute("text-italic");
  }

  /**
   * Makes text underlined.
   */
  get _textUnderline(): "" | null {
    return this.getStringAttribute("text-underline");
  }

  /**
   * Renders a line through the middle of text.
   */
  get _textStrikethrough(): "" | null {
    return this.getStringAttribute("text-strikethrough");
  }

  /**
   * Forces the specified text casing.
   */
  get _textCase(): "uppercase" | "lowercase" | "capitalize" | null {
    return this.getStringAttribute("text-case");
  }

  /**
   * Sets the horizontal alignment of text.
   *
   * If not provided a value, it will use "center"
   */
  get _textAlign(): "" | "start" | "end" | "center" | "justify" | null {
    return this.getStringAttribute("text-align");
  }

  /**
   * Determines whether text will wrap if there is not enough horizontal space to fit it on a single line.
   *
   * If not provided a value, it will use "wrap".
   */
  get _textWrap(): "" | "wrap" | "nowrap" | null {
    return this.getStringAttribute("text-wrap");
  }

  /**
   * Sets the color of text rendered inside this element.
   */
  get _textColor(): "" | "wrap" | "nowrap" | null {
    return this.getStringAttribute("text-color");
  }

  /**
   * Sets the color of the stroke rendered around the text.
   */
  get _textStrokeColor():
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
    | null {
    return this.getStringAttribute("text-stroke-color");
  }

  /**
   * Sets the width of the stroke rendered around the text.
   */
  get _textStrokeWidth():
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | null {
    return this.getStringAttribute("text-stroke-width");
  }

  /**
   * Sets the distance between the line and the text being underlined.
   */
  get _textUnderlineOffset(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-underline-offset");
  }

  /**
   * Sets the thickness of underline or strikethrough lines.
   */
  get _textDecorationThickness(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-decoration-thickness");
  }

  /**
   * Sets the background color of this element.
   */
  get _bgColor():
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
    | null {
    return this.getStringAttribute("bg-color");
  }

  /**
   * Sets the background gradient of this element.
   */
  get _bgGradient(): string | null {
    return this.getStringAttribute("bg-gradient");
  }

  /**
   * Sets the background pattern of this element.
   */
  get _bgPattern(): string | null {
    return this.getStringAttribute("bg-pattern");
  }

  /**
   * Sets the background image of this element.
   */
  get _bgImage(): string | null {
    return this.getStringAttribute("bg-image");
  }

  /**
   * Sets how background images are repeated.
   *
   * If not provided a value, it will use "repeat".
   */
  get _bgRepeat(): "" | "repeat" | "x" | "y" | "none" | null {
    return this.getStringAttribute("bg-repeat");
  }

  /**
   * Sets how background images are aligned.
   *
   * If not provided a value, it will use "center".
   */
  get _bgAlign(): "" | "center" | "top" | "bottom" | "left" | "right" | null {
    return this.getStringAttribute("bg-align");
  }

  /**
   * Sets how background images are fit in their parent container.
   *
   * The image can be stretched, or constrained to fit the available space.
   *
   * If not provided a value, it will use "contain".
   */
  get _bgFit(): "" | "contain" | "cover" | null {
    return this.getStringAttribute("bg-fit");
  }

  /**
   * Creates a clipping region that determines what part of an element should be shown.
   * Parts that are inside the region are shown, while those outside are hidden.
   *
   * If not provided a value, it will use "circle".
   */
  get _clip(): "" | "circle" | null {
    return this.getStringAttribute("bg-fit");
  }

  /**
   * Sets the color of the border around this element.
   */
  get _borderColor():
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
    | null {
    return this.getStringAttribute("border-color");
  }

  /**
   * Sets the width of the border around this element.
   */
  get _borderWidth(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width");
  }

  /**
   * Adds a drop shadow to this element.
   */
  get _shadow(): "0" | "1" | "2" | "3" | "4" | "5" | null {
    return this.getStringAttribute("shadow");
  }

  /**
   * Adds an inner shadow to this element.
   */
  get _shadowInset(): "0" | "1" | "2" | "3" | "4" | "5" | null {
    return this.getStringAttribute("shadow-inset");
  }

  /**
   * Blurs everything behind this element.
   */
  get _blur(): string | null {
    return this.getStringAttribute("blur");
  }

  /**
   * Brightens everything behind this element.
   */
  get _brightness(): string | null {
    return this.getStringAttribute("brightness");
  }

  /**
   * Sharpens everything behind this element.
   */
  get _contrast(): string | null {
    return this.getStringAttribute("contrast");
  }

  /**
   * Makes everything behind this element black & white.
   */
  get _grayscale(): string | null {
    return this.getStringAttribute("grayscale");
  }

  /**
   * Shifts the hue of everything behind this element.
   */
  get _hue(): string | null {
    return this.getStringAttribute("hue");
  }

  /**
   * Inverts the color of everything behind this element.
   */
  get _invert(): string | null {
    return this.getStringAttribute("invert");
  }

  /**
   * Makes everything behind this element sepia-colored.
   */
  get _sepia(): string | null {
    return this.getStringAttribute("sepia");
  }

  /**
   * Saturates everything behind this element.
   */
  get _saturate(): string | null {
    return this.getStringAttribute("saturate");
  }

  /**
   * Sets how this element's content should blend with everything behind it.
   */
  get _blend(): string | null {
    return this.getStringAttribute("blend");
  }

  /**
   * Sets the opacity of an element.
   * Opacity corresponds to how transparent the element is,
   * with 0 being fully transparent and 1 being fully opaque.
   */
  get _opacity(): "0" | "0.5" | "1" | null {
    return this.getStringAttribute("blend");
  }

  /**
   * Moves an element along the x-axis.
   */
  get _translateX(): string | null {
    return this.getStringAttribute("translate-x");
  }

  /**
   * Moves an element along the y-axis.
   */
  get _translateY(): string | null {
    return this.getStringAttribute("translate-y");
  }

  /**
   * Moves an element along the z-axis.
   */
  get _translateZ(): string | null {
    return this.getStringAttribute("translate-z");
  }

  /**
   * Rotates an element along the x-axis.
   */
  get _rotateX(): string | null {
    return this.getStringAttribute("rotate-x");
  }

  /**
   * Rotates an element along the y-axis.
   */
  get _rotateY(): string | null {
    return this.getStringAttribute("rotate-y");
  }

  /**
   * Rotates an element along the z-axis.
   */
  get _rotateZ(): string | null {
    return this.getStringAttribute("rotate-z");
  }

  /**
   * Rotates an element along the x-axis.
   */
  get _scaleX(): string | null {
    return this.getStringAttribute("scale-x");
  }

  /**
   * Rotates an element along the y-axis.
   */
  get _scaleY(): string | null {
    return this.getStringAttribute("scale-y");
  }

  /**
   * Rotates an element along the z-axis.
   */
  get _scaleZ(): string | null {
    return this.getStringAttribute("scale-z");
  }

  /**
   * Skews an element along the x-axis.
   */
  get _skewX(): string | null {
    return this.getStringAttribute("skew-x");
  }

  /**
   * Skews an element along the y-axis.
   */
  get _skewY(): string | null {
    return this.getStringAttribute("skew-y");
  }

  /**
   * Sets the origin point for this element's transformations.
   */
  get _pivot(): "center" | "top" | "left" | "bottom" | "right" | null {
    return this.getStringAttribute("pivot");
  }

  /**
   * Specifies the amount of time to wait before starting a property's transition effect when its value changes.
   */
  get _delay(): "0" | "0.1" | "0.2" | "0.3" | "0.4" | "0.5" | "1" | null {
    return this.getStringAttribute("delay");
  }

  /**
   * Specifies the length of time a transition should take to complete.
   */
  get _duration():
    | "0s"
    | "100ms"
    | "200ms"
    | "300ms"
    | "400ms"
    | "500ms"
    | "1s"
    | null {
    return this.getStringAttribute("duration");
  }

  /**
   * Applies an animation to this element.
   */
  get _animate(): "spin" | "ping" | "bounce" | "pulse" | "sheen" | null {
    return this.getStringAttribute("animate");
  }

  constructor(init: ShadowRootInit = { mode: "open", delegatesFocus: true }) {
    super();
    const shadowRoot = this.attachShadow(init);
    shadowRoot.innerHTML = this.html;
    shadowRoot.adoptedStyleSheets = [styles, ...this.styles];
  }

  override focus(options?: FocusOptions) {
    this.root.focus(options);
  }

  override blur() {
    this.root.blur();
  }

  protected showFocusRing = (visible: boolean) => {
    this.updateRootClass("focused", visible);
  };

  protected onPointerDown = (e: PointerEvent) => {
    pointerPress();
    this.showFocusRing(shouldShowStrongFocus());
  };

  protected onFocus = () => {
    this.showFocusRing(shouldShowStrongFocus());
  };

  protected onBlur = () => {
    this.showFocusRing(false);
  };

  private readonly onActivationClick = (event: MouseEvent) => {
    if (!isActivationClick(event)) {
      return;
    }
    this.focus();
    dispatchActivationClick(this.root);
  };

  protected bindFocus(el: HTMLElement) {
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("focus", this.onFocus);
    el.addEventListener("blur", this.onBlur);
    if (!isServer()) {
      el.addEventListener("click", this.onActivationClick);
    }
  }

  protected unbindFocus(el: HTMLElement) {
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("focus", this.onFocus);
    el.removeEventListener("blur", this.onBlur);
    if (!isServer()) {
      el.removeEventListener("click", this.onActivationClick);
    }
  }

  /**
   * Invoked each time one of the custom element's attributes is added, removed, or changed. Which attributes to notice change for is specified in a static get observedAttributes method
   */
  protected attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    const className = aliases[name] ?? name;
    if (className === "aria-label") {
      this.updateRootAttribute(className, newValue);
    } else {
      const transformer = STYLE_TRANSFORMERS[className];
      if (transformer) {
        this.updateStyleAttribute(className, newValue, transformer);
        if (className === "text-size") {
          // Setting textSize should also set default line-height
          this.updateStyleAttribute(
            "text-size--height",
            newValue,
            getCssTextSizeHeight
          );
        }
        if (
          className === "text-stroke-width" ||
          className === "text-stroke-color"
        ) {
          const width = this._textStrokeWidth || "1";
          this.updateRootStyle("--text-stroke", getCssTextStroke(width));
        }
      }
    }
  }

  /**
   * Invoked each time the custom element is appended into a document-connected element.
   * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
   */
  protected connectedCallback(): void {
    this.bindFocus(this.root);
  }

  /**
   * Invoked each time the custom element is disconnected from the document's DOM.
   */
  protected disconnectedCallback(): void {
    this.unbindFocus(this.root);
  }

  getElementByTag<T extends HTMLElement>(name: string): T | null {
    return this.root.querySelector<T>(name);
  }

  getElementByPart<T extends HTMLElement>(name: string): T | null {
    return this.root.querySelector<T>(`[part=${name}]`);
  }

  getSlotByName(name: string): HTMLSlotElement | null {
    return (
      this.shadowRoot?.querySelector<HTMLSlotElement>(`slot[name=${name}]`) ??
      null
    );
  }

  updateRootClass(name: string, active: boolean | string | null): boolean {
    if (typeof active === "boolean") {
      if (active) {
        this.root.classList.add(name);
        return true;
      } else {
        this.root.classList.remove(name);
        return false;
      }
    } else {
      if (active != null && active !== "false") {
        this.root.classList.add(name);
        return true;
      } else {
        this.root.classList.remove(name);
        return false;
      }
    }
  }

  updateRootAttribute<T>(name: string, value: T) {
    updateAttribute<T>(this.root, name, value);
  }

  updateRootStyle(name: string, value: string | null) {
    this.root.style.setProperty(name, value ?? null);
  }

  private updateStyleAttribute(
    name: string,
    newValue: string | null,
    valueFormatter?: (v: string) => string
  ) {
    const varName = `--${name}`;
    const formattedValue =
      valueFormatter && newValue != null ? valueFormatter(newValue) : newValue;
    const classActive = this.updateRootClass(name, newValue);
    if (classActive && formattedValue) {
      this.updateRootStyle(varName, formattedValue);
    } else {
      this.updateRootStyle(varName, null);
    }
  }

  getBooleanAttribute(name: string): boolean {
    const value = this.getAttribute(name);
    return value != null;
  }

  setBooleanAttribute(name: string, value: boolean): void {
    if (value) {
      this.setAttribute(name, "");
    } else {
      this.removeAttribute(name);
    }
  }

  getStringAttribute<T extends string>(name: string): T | null {
    const value = this.getAttribute(name) as T;
    return value != null ? value : null;
  }

  setStringAttribute<T extends string>(name: T, value: T | null): void {
    if (value != null) {
      this.setAttribute(name, value);
    } else {
      this.removeAttribute(name);
    }
  }

  getNumberAttribute(name: string): number | null {
    const value = this.getAttribute(name);
    return value != null ? Number(value) : null;
  }

  setNumberAttribute(name: string, value: number | null): void | null {
    if (value != null) {
      this.setAttribute(name, String(value));
    } else {
      this.removeAttribute(name);
    }
  }
}
