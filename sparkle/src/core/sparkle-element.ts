import { STYLE_ALIASES } from "../constants/STYLE_ALIASES";
import { STYLE_TRANSFORMERS } from "../constants/STYLE_TRANSFORMERS";
import Styles from "../helpers/styles";
import { Color } from "../types/color";
import { dispatchActivationClick, isActivationClick } from "../utils/events";
import { pointerPress, shouldShowStrongFocus } from "../utils/focus";
import { getCssTextSizeHeight } from "../utils/getCssTextSizeHeight";
import { getCssTextStroke } from "../utils/getCssTextStroke";
import { getCssTextWhiteSpace } from "../utils/getCssTextWhiteSpace";
import { getUnitlessValue } from "../utils/getUnitlessValue";
import { isAssignedToSlot } from "../utils/isAssignedToSlot";
import { isServer } from "../utils/isServer";
import { navEndKey } from "../utils/navEndKey";
import { navNextKey } from "../utils/navNextKey";
import { navPrevKey } from "../utils/navPrevKey";
import { navStartKey } from "../utils/navStartKey";
import { updateAttribute } from "../utils/updateAttribute";
import { NORMALIZE_STYLES } from "./normalize";
import css from "./sparkle-element.css";
import html from "./sparkle-element.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export default class SparkleElement extends HTMLElement {
  private static _dependencies: Record<string, string> = {};
  static get dependencies(): Record<string, string> {
    return this._dependencies;
  }
  static set dependencies(value: Record<string, string>) {
    this._dependencies = value;
  }

  /**
   * Defines this component with the specified tag name.
   *
   * @param tag - the tag name to use for this component.
   * @param dependencies - the tag names to use for the dependencies of this component.
   * @returns a promise that resolves when the named element is finished being defined.
   */
  static async define(
    tag: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    if (dependencies) {
      this.dependencies = { ...this.dependencies, ...dependencies };
    }
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  get html(): string {
    return html;
  }

  get styles(): CSSStyleSheet[] {
    return [];
  }

  static get observedAttributes() {
    return [
      ...Object.keys(STYLE_TRANSFORMERS),
      ...Object.keys(STYLE_ALIASES),
      "rtl",
      "aria-label",
      "disabled",
      "loading",
    ];
  }

  get aliases(): Record<string, string> {
    return STYLE_ALIASES;
  }

  get root(): HTMLElement {
    return this.shadowRoot?.firstElementChild as HTMLElement;
  }

  get contentSlot(): HTMLSlotElement | null {
    return this.getElementByClass("content");
  }

  /**
   * Whether or not the element should display content right-to-left instead of the usual left-to-right.
   */
  get rtl(): boolean {
    return this.getBooleanAttribute("rtl");
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
   * Sets this element's `position` in a document.
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
   * Sets a preferred `aspect-ratio` for the box.
   */
  get _aspect():
    | "square"
    | "landscape"
    | "portrait"
    | "widescreen"
    | "ultrawide"
    | "golden"
    | string
    | null {
    return this.getStringAttribute("aspect");
  }

  /**
   * Sets the desired `overflow` behavior of content that does not fit within this element's width.
   *
   * If not provided a value, defaults to `visible`.
   */
  get _overflowX(): "" | "visible" | "scroll" | "clip" | null {
    return this.getStringAttribute("overflow-x");
  }

  /**
   * Sets the desired `overflow` behavior of content that does not fit within this element's height.
   *
   * If not provided a value, defaults to `visible`.
   */
  get _overflowY(): "" | "visible" | "scroll" | "clip" | null {
    return this.getStringAttribute("overflow-y");
  }

  /**
   * Sets the `z-index` of a positioned element and its descendants. Elements with a larger z value appear on top of those with a smaller one.
   */
  get _z():
    | "0"
    | "1"
    | "drawer"
    | "dialog"
    | "dropdown"
    | "alert"
    | "tooltip"
    | null {
    return this.getStringAttribute("z");
  }

  /**
   * Sets this element's `width`.
   */
  get _width(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("width");
  }

  /**
   * Sets the `min-width` of this element. Prevents the element's width from becoming smaller than the value specified.
   */
  get _widthMin(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("width-min");
  }

  /**
   * Sets the `max-width` of this element. Prevents the element's width from becoming larger than the value specified.
   */
  get _widthMax(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("width-max");
  }

  /**
   * Sets this element's `height`.
   */
  get _height(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("height");
  }

  /**
   * Sets the `min-height` of this element. Prevents the element's height from becoming smaller than the value specified.
   */
  get _heightMin(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("height-min");
  }

  /**
   * Sets the `max-height` of this element. Prevents the element's height from becoming larger than the value specified.
   */
  get _heightMax(): "100%" | "min-content" | "max-content" | null {
    return this.getStringAttribute("height-max");
  }

  /**
   * Rounds the corners of this element by specifying a `border-radius`.
   *
   * @summary c
   */
  get _corner(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner");
  }

  /**
   * Rounds the top-left and top-right corners of this element by specifying a `border-top-left-radius` and `border-top-right-radius`.
   *
   * @summary c-t
   */
  get _cornerT(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-t");
  }

  /**
   * Rounds the top-right and bottom-right corners of this element by specifying a `border-top-right-radius` and `border-bottom-right-radius`.
   *
   * @summary c-r
   */
  get _cornerR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-r");
  }

  /**
   * Rounds the bottom-left and bottom-right corners of this element by specifying a `border-bottom-left-radius` and `border-bottom-right-radius`.
   *
   * @summary c-b
   */
  get _cornerB(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-b");
  }

  /**
   * Rounds the top-left and bottom-left corners of this element by specifying a `border-top-left-radius` and `border-bottom-left-radius`.
   *
   * @summary c-l
   */
  get _cornerL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-l");
  }

  /**
   * Rounds the top-left corner of this element by specifying a `border-top-left-radius`.
   *
   * @summary c-tl
   */
  get _cornerTL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-tl");
  }

  /**
   * Rounds the top-right corner of this element by specifying a `border-top-right-radius`.
   *
   * @summary c-tr
   */
  get _cornerTR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-tr");
  }

  /**
   * Rounds the bottom-right corner of this element by specifying a `border-bottom-right-radius`.
   *
   * @summary c-br
   */
  get _cornerBR(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-br");
  }

  /**
   * Rounds the bottom-left corner of this element by specifying a `border-bottom-left-radius`.
   *
   * @summary c-bl
   */
  get _cornerBL(): "xs" | "sm" | "md" | "lg" | "xl" | "full" | "circle" | null {
    return this.getStringAttribute("corner-bl");
  }

  /**
   * Sets how far the `top` `right` `bottom` and `left` edges of this element are from the corresponding edges of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i
   */
  get _inset(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset");
  }

  /**
   * Sets how far the `top` edge of this element is from the top edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-t
   */
  get _insetT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-t");
  }

  /**
   * Sets how far the `right` edge of this element is from the right edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-r
   */
  get _insetR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-r");
  }

  /**
   * Sets how far the `bottom` edge of this element is from the bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-b
   */
  get _insetB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-b");
  }

  /**
   * Sets how far the `left` edge of this element is from the left edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-l
   */
  get _insetL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-l");
  }

  /**
   * Sets how far the `left` and `right` edge of this element is from the left and right edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-lr
   */
  get _insetLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-lr");
  }

  /**
   * Sets how far the `top` and `bottom` edge of this element is from the top and bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-tb
   */
  get _insetTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("inset-tb");
  }

  /**
   * Sets the `border-width` of this element.
   *
   * @summary b-width
   */
  get _borderWidth(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width");
  }

  /**
   * Sets the `border-top-width` of this element.
   *
   * @summary b-width-t
   */
  get _borderWidthT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-t");
  }

  /**
   * Sets the `border-right-width` of this element.
   *
   * @summary b-width-r
   */
  get _borderWidthR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-r");
  }

  /**
   * Sets the `border-bottom-width` of this element.
   *
   * @summary b-width-b
   */
  get _borderWidthB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-b");
  }

  /**
   * Sets the `border-left-width` of this element.
   *
   * @summary b-width-l
   */
  get _borderWidthL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-l");
  }

  /**
   * Sets the `border-left-width` and `border-right-width` of this element.
   *
   * @summary b-width-lr
   */
  get _borderWidthLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-lr");
  }

  /**
   * Sets the `border-top-width` and `border-bottom-width` of this element.
   *
   * @summary b-width-tb
   */
  get _borderWidthTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("border-width-tb");
  }

  /**
   * Sets the `border-color` of this element.
   */
  get _borderColor(): Color | null {
    return this.getStringAttribute("border-color");
  }

  /**
   * Sets the `border-top-color` of this element.
   *
   * @summary b-color-t
   */
  get _borderColorT(): Color | null {
    return this.getStringAttribute("border-color-t");
  }

  /**
   * Sets the `border-right-color` of this element.
   *
   * @summary b-color-r
   */
  get _borderColorR(): Color | null {
    return this.getStringAttribute("border-color-r");
  }

  /**
   * Sets the `border-bottom-color` of this element.
   *
   * @summary b-color-b
   */
  get _borderColorB(): Color | null {
    return this.getStringAttribute("border-color-b");
  }

  /**
   * Sets the `border-left-color` of this element.
   *
   * @summary b-color-l
   */
  get _borderColorL(): Color | null {
    return this.getStringAttribute("border-color-l");
  }

  /**
   * Sets the `border-top-color` and `border-bottom-color` of this element.
   *
   * @summary b-color-tb
   */
  get _borderColorTB(): Color | null {
    return this.getStringAttribute("border-color-tb");
  }

  /**
   * Sets the `border-left-color` and `border-right-color` of this element.
   *
   * @summary b-color-lr
   */
  get _borderColorLR(): Color | null {
    return this.getStringAttribute("border-color-lr");
  }

  /**
   * Sets the `margin` area around this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m
   */
  get _margin(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin");
  }

  /**
   * Sets the `margin-top` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-t
   */
  get _marginT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-t");
  }

  /**
   * Sets the `margin-right` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-r
   */
  get _marginR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-r");
  }

  /**
   * Sets the `margin-bottom` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-b
   */
  get _marginB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-b");
  }

  /**
   * Sets the `margin-left` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-l
   */
  get _marginL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-l");
  }

  /**
   * Sets the `margin-left` and `margin-right` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-lr
   */
  get _marginLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-lr");
  }

  /**
   * Sets the `margin-top` and `margin-bottom` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-tb
   */
  get _marginTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("margin-tb");
  }

  /**
   * Sets the `padding` area around this element.
   *
   * @summary p
   */
  get _padding(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding");
  }

  /**
   * Sets the `padding-top` area of this element.
   *
   * @summary p-t
   */
  get _paddingT(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-t");
  }

  /**
   * Sets the `padding-right` area of this element.
   *
   * @summary p-r
   */
  get _paddingR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-r");
  }

  /**
   * Sets the `padding-bottom` area of this element.
   *
   * @summary p-b
   */
  get _paddingB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-b");
  }

  /**
   * Sets the `padding-left` area of this element.
   *
   * @summary p-l
   */
  get _paddingL(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-l");
  }

  /**
   * Sets the `padding-left` and `padding-right` areas of this element.
   *
   * @summary p-lr
   */
  get _paddingLR(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-lr");
  }

  /**
   * Sets the `padding-top` and `padding-bottom` areas of this element.
   *
   * @summary p-tb
   */
  get _paddingTB(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("padding-tb");
  }

  /**
   * Sets the `flex-direction` of this element so that its children are arranged in either a row or column.
   */
  get _childLayout():
    | "row"
    | "column"
    | "row-reverse"
    | "column-reverse"
    | null {
    return this.getStringAttribute("child-layout");
  }

  /**
   * Sets the `gap` between children.
   */
  get _childGap(): "" | "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("child-gap");
  }

  /**
   * Uses `align-items` to align children along the cross axis.
   *
   * When layout is `column`, this controls all children's horizontal alignment.
   * When layout is `row`, this controls all children's vertical alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get _childAlign(): "" | "center" | "stretch" | "start" | "end" | null {
    return this.getStringAttribute("child-align");
  }

  /**
   * Uses `justify-content` to align children along the main axis.
   *
   * When layout is `column`, this controls all children's vertical alignment.
   * When layout is `row`, this controls all children's horizontal alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get _childJustify():
    | ""
    | "center"
    | "stretch"
    | "start"
    | "end"
    | "between"
    | "around"
    | "evenly"
    | null {
    return this.getStringAttribute("child-justify");
  }

  /**
   * Sets the desired `flex-wrap` behavior if any children do not fit within the width of this element.
   *
   * If not provided a value, defaults to `wrap`.
   */
  get _childOverflow(): "" | "visible" | "wrap" | "wrap-reverse" | null {
    return this.getStringAttribute("child-overflow");
  }

  /**
   * Uses `align-self` to override the alignment for this element along the cross axis.
   *
   * When layout is `column`, this controls the horizontal alignment.
   * When layout is `row`, this controls the vertical alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get _selfAlign(): "" | "center" | "stretch" | "start" | "end" | null {
    return this.getStringAttribute("self-align");
  }

  /**
   * Uses `flex-grow` to control how much the element will grow to fill the space available in its parent container.
   *
   * If 0, the element will not grow.
   * If 1, the element will grow to fill all available space.
   * If 2, the element will grow twice as much as all elements with 1 flex.
   *
   * If not provided a value, defaults to `1`.
   */
  get _grow(): "" | "0" | "1" | "2" | null {
    return this.getStringAttribute("grow");
  }

  /**
   * Uses `flex-shrink` to control how much the element will shrink when there is not enough space available in its parent container.
   *
   * If 0, the element will not shrink.
   * If 1, the element will shrink as much as possible.
   *
   * If not provided a value, defaults to `0`.
   */
  get _shrink(): "" | "0" | "1" | null {
    return this.getStringAttribute("shrink");
  }

  /**
   * Sets the element's `visibility` to be hidden.
   */
  get _invisible(): "" | null {
    return this.getStringAttribute("invisible");
  }

  /**
   * Allows this element to capture `pointer-events`.
   */
  get _interactable(): "" | null {
    return this.getStringAttribute("interactable");
  }

  /**
   * Enables `user-select` so the user can select any text inside this element.
   */
  get _selectable(): "" | null {
    return this.getStringAttribute("selectable");
  }

  /**
   * Sets the `color` of content rendered inside this element.
   */
  get _color(): Color | null {
    return this.getStringAttribute("color");
  }

  /**
   * Specifies which `font-family` this element will use to render text.
   */
  get _textFont(): "sans" | "serif" | "mono" | null {
    return this.getStringAttribute("text-font");
  }

  /**
   * Sets the `font-size` of all text inside this element.
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
   * Sets the `line-height` of all text inside this element.
   *
   * This is commonly used to increase or decrease the distance between lines of text.
   */
  get _textLeading(): "none" | "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-leading");
  }

  /**
   * Sets the `letter-spacing` of all text inside this element.
   *
   * This value is added to the font's natural letter spacing.
   * Positive values cause letters to spread farther apart, while negative values bring letters closer together.
   */
  get _textKerning(): "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | null {
    return this.getStringAttribute("text-kerning");
  }

  /**
   * Sets the `font-weight` of all text inside this element.
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
   * Sets the `text-style` of all text inside this element so that the text is italic.
   */
  get _textItalic(): "" | null {
    return this.getStringAttribute("text-italic");
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders underneath the text.
   */
  get _textUnderline(): "" | null {
    return this.getStringAttribute("text-underline");
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders through the middle of the text.
   */
  get _textStrikethrough(): "" | null {
    return this.getStringAttribute("text-strikethrough");
  }

  /**
   * Sets the `text-transform` of all text inside this element to force the text to be uppercase, lowercase, or capitalized.
   */
  get _textCase(): "uppercase" | "lowercase" | "capitalize" | null {
    return this.getStringAttribute("text-case");
  }

  /**
   * Sets the desired `text-align` behavior of all text inside this element.
   *
   * Aligns text to the center, start, or end, or justifies it to fill the width of this element.
   *
   * If not provided a value, defaults to `center`.
   */
  get _textAlign(): "" | "center" | "start" | "end" | "justify" | null {
    return this.getStringAttribute("text-align");
  }

  /**
   * Sets the desired `text-overflow` and `white-space` behavior if text cannot fit on a single line.
   *
   * If not provided a value, defaults to `visible`.
   */
  get _textOverflow(): "" | "visible" | "wrap" | "clip" | "ellipsis" | null {
    return this.getStringAttribute("text-overflow");
  }

  /**
   * Sets the `color` of text rendered inside this element.
   */
  get _textColor(): "" | "wrap" | "nowrap" | null {
    return this.getStringAttribute("text-color");
  }

  /**
   * Uses `text-shadow` to create a colored stroke around the text.
   */
  get _textStrokeColor(): Color | null {
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
   * Sets the `text-underline-offset` of all underlined text inside this element.
   */
  get _textUnderlineOffset(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-underline-offset");
  }

  /**
   * Sets the `text-decoration-thickness` of all underline or strikethrough lines.
   */
  get _textDecorationThickness(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("text-decoration-thickness");
  }

  /**
   * Sets the `background-color` of this element.
   *
   * @summary bg-color
   */
  get _backgroundColor(): Color | null {
    return this.getStringAttribute("background-color");
  }

  /**
   * Uses `background-image` to display a color gradient inside this element.
   *
   * @summary bg-gradient
   */
  get _backgroundGradient(): "gloss" | string | null {
    return this.getStringAttribute("background-gradient");
  }

  /**
   * Uses `background-image` to display a pattern inside this element.
   *
   * @summary bg-pattern
   */
  get _backgroundPattern(): string | null {
    return this.getStringAttribute("background-pattern");
  }

  /**
   * Uses `background-image` to display an image inside this element.
   *
   * @summary bg-image
   */
  get _backgroundImage(): string | null {
    return this.getStringAttribute("background-image");
  }

  /**
   * Sets `background-repeat` to determine if background images are repeated in a tiling pattern.
   *
   * If not provided a value, defaults to `repeat`.
   *
   * @summary bg-repeat
   */
  get _backgroundRepeat(): "" | "repeat" | "x" | "y" | "none" | null {
    return this.getStringAttribute("background-repeat");
  }

  /**
   * Sets `background-position` to align background images to the center, top, bottom, left, or right edge of this element.
   *
   * If not provided a value, defaults to `center`.
   *
   * @summary bg-align
   */
  get _backgroundAlign():
    | ""
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | null {
    return this.getStringAttribute("background-align");
  }

  /**
   * Adjusts the `background-size` of images so that they fit inside this element.
   *
   * The image can be stretched, or constrained to fit the available space.
   *
   * If not provided a value, defaults to `contain`.
   *
   * @summary bg-fit
   */
  get _backgroundFit(): "" | "contain" | "cover" | null {
    return this.getStringAttribute("background-fit");
  }

  /**
   * Sets the `mask-image` of this element to change the visual shape of this element.
   * Parts that are inside the mask region are shown, while those outside are hidden.
   *
   * If not provided a value, defaults to `circle`.
   */
  get _mask():
    | ""
    | "angled-corner"
    | "scooped-corner"
    | "notched-corner"
    | "scooped-edge-tb"
    | "scooped-edge-lr"
    | "scooped-edge-t"
    | "scooped-edge-b"
    | "scooped-edge-l"
    | "scooped-edge-r"
    | "scalloped-edge"
    | "scalloped-edge-tb"
    | "scalloped-edge-lr"
    | "scalloped-edge-t"
    | "scalloped-edge-b"
    | "scalloped-edge-l"
    | "scalloped-edge-r"
    | "drip-edge"
    | "drip-edge-tb"
    | "drip-edge-lr"
    | "drip-edge-t"
    | "drip-edge-b"
    | "drip-edge-l"
    | "drip-edge-r"
    | "zigzag-edge-tb"
    | "zigzag-edge-lr"
    | "zigzag-edge-t"
    | "zigzag-edge-b"
    | "zigzag-edge-l"
    | "zigzag-edge-r"
    | null {
    return this.getStringAttribute("mask");
  }

  /**
   * Adds a `drop-shadow` `filter` to this element.
   */
  get _shadow(): "0" | "1" | "2" | "3" | "4" | "5" | null {
    return this.getStringAttribute("shadow");
  }

  /**
   * Adds an inner `box-shadow` to this element.
   */
  get _shadowInset(): "0" | "1" | "2" | "3" | "4" | "5" | null {
    return this.getStringAttribute("shadow-inset");
  }

  /**
   * Uses a `blur` `filter` to blur everything behind this element.
   */
  get _blur(): string | null {
    return this.getStringAttribute("blur");
  }

  /**
   * Uses a `brightness` `filter` to brighten the colors of everything behind this element.
   */
  get _brightness(): string | null {
    return this.getStringAttribute("brightness");
  }

  /**
   * Uses a `contrast` `filter` to increase the contrast of everything behind this element.
   */
  get _contrast(): string | null {
    return this.getStringAttribute("contrast");
  }

  /**
   * Uses a `grayscale` `filter` to make everything behind this element black & white.
   */
  get _grayscale(): string | null {
    return this.getStringAttribute("grayscale");
  }

  /**
   * Uses a `hue-rotate` `filter` to shift the hue of everything behind this element.
   */
  get _hue(): string | null {
    return this.getStringAttribute("hue");
  }

  /**
   * Uses an `invert` `filter` to invert the colors of everything behind this element.
   */
  get _invert(): string | null {
    return this.getStringAttribute("invert");
  }

  /**
   * Uses a `sepia` `filter` to make everything behind this element sepia-tinged.
   */
  get _sepia(): string | null {
    return this.getStringAttribute("sepia");
  }

  /**
   * Uses a `saturate` `filter` to saturate the colors of everything behind this element.
   */
  get _saturate(): string | null {
    return this.getStringAttribute("saturate");
  }

  /**
   * Sets the desired `mix-blend-mode` of this element to control how the colors of this element blend with the colors of everything behind it.
   */
  get _blend():
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
    | "luminosity"
    | null {
    return this.getStringAttribute("blend");
  }

  /**
   * Sets the `opacity` of an element to control how transparent it is,
   * with 0 being fully transparent and 1 being fully opaque.
   */
  get _opacity(): "0" | "0.5" | "1" | null {
    return this.getStringAttribute("blend");
  }

  /**
   * Sets an element's `transform` to move it along the x-axis.
   */
  get _translateX(): string | null {
    return this.getStringAttribute("translate-x");
  }

  /**
   * Sets an element's `transform` to move it along the y-axis.
   */
  get _translateY(): string | null {
    return this.getStringAttribute("translate-y");
  }

  /**
   * Sets an element's `transform` to move it along the z-axis.
   */
  get _translateZ(): string | null {
    return this.getStringAttribute("translate-z");
  }

  /**
   * Sets an element's `transform` to rotate it around the x-axis.
   */
  get _rotateX(): string | null {
    return this.getStringAttribute("rotate-x");
  }

  /**
   * Sets an element's `transform` to rotate it around the y-axis.
   */
  get _rotateY(): string | null {
    return this.getStringAttribute("rotate-y");
  }

  /**
   * Sets an element's `transform` to rotate it around the z-axis.
   */
  get _rotateZ(): string | null {
    return this.getStringAttribute("rotate-z");
  }

  /**
   * Sets an element's `transform` to scale it along the x-axis.
   */
  get _scaleX(): string | null {
    return this.getStringAttribute("scale-x");
  }

  /**
   * Sets an element's `transform` to scale it along the y-axis.
   */
  get _scaleY(): string | null {
    return this.getStringAttribute("scale-y");
  }

  /**
   * Sets an element's `transform` to scale it along the z-axis.
   */
  get _scaleZ(): string | null {
    return this.getStringAttribute("scale-z");
  }

  /**
   * Sets an element's `transform` to skew it along the x-axis.
   */
  get _skewX(): string | null {
    return this.getStringAttribute("skew-x");
  }

  /**
   * Sets an element's `transform` to skew it along the y-axis.
   */
  get _skewY(): string | null {
    return this.getStringAttribute("skew-y");
  }

  /**
   * Sets the `transform-origin` for any transformations applied to this element.
   */
  get _pivot(): "center" | "top" | "left" | "bottom" | "right" | null {
    return this.getStringAttribute("pivot");
  }

  /**
   * Specifies the `transition-delay` between property changes and their resulting transition animation.
   */
  get _delay(): "0" | "0.1" | "0.2" | "0.3" | "0.4" | "0.5" | "1" | null {
    return this.getStringAttribute("delay");
  }

  /**
   * Specifies the `transition-duration` of property changes.
   */
  get _duration():
    | "0s"
    | "100ms"
    | "200ms"
    | "300ms"
    | "400ms"
    | "500ms"
    | null {
    return this.getStringAttribute("duration");
  }

  /**
   * Specifies the `transition-timing-function` used for property changes.
   */
  get _ease():
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
    | null {
    return this.getStringAttribute("ease");
  }

  /**
   * Applies an `animation` to this element.
   */
  get _animate():
    | "spin"
    | "ping"
    | "sheen"
    | "blink"
    | "float"
    | "bounce"
    | "fade-in"
    | "fade-out"
    | "scale-up"
    | "scale-down"
    | "slide-out-up"
    | "slide-out-down"
    | "slide-out-right"
    | "slide-out-left"
    | "slide-in-up"
    | "slide-in-down"
    | "slide-in-right"
    | "slide-in-left"
    | "shake-x"
    | "shake-y"
    | "enter"
    | "exit"
    | "pulse"
    | null {
    return this.getStringAttribute("animate");
  }

  /**
   * Allows keyboard navigation between the children of this element.
   */
  get _navigation(): "keyboard" | null {
    return this.getStringAttribute("navigation");
  }

  protected _items: HTMLElement[] = [];
  get items(): HTMLElement[] {
    return this._items;
  }

  constructor(init: ShadowRootInit = { mode: "open", delegatesFocus: true }) {
    super();
    const shadowRoot = this.attachShadow(init);
    shadowRoot.innerHTML = this.html;
    shadowRoot.adoptedStyleSheets = [NORMALIZE_STYLES];
    const fonts = Styles.get("fonts");
    const keyframes = Styles.get("keyframes");
    if (fonts) {
      shadowRoot.adoptedStyleSheets.push(fonts);
    }
    if (keyframes) {
      shadowRoot.adoptedStyleSheets.push(keyframes);
    }
    shadowRoot.adoptedStyleSheets.push(styles);
    shadowRoot.adoptedStyleSheets.push(...this.styles);
  }

  /**
   * Replaces tags in html with tag aliases specified by `dependencies`.
   *
   * @param html - the original html.
   * @param tags - the tags to replace. (If not specified, this defaults to the keys of the `dependencies` property.)
   * @returns the augmented html.
   */
  static augment(
    html: string,
    tags?: string[] | Record<string, string>
  ): string {
    if (this.dependencies) {
      const keys = tags
        ? Array.isArray(tags)
          ? tags
          : Object.keys(tags)
        : Object.keys(this.dependencies);
      keys.forEach((key) => {
        const value = this.dependencies[key];
        if (value) {
          html.replace(new RegExp(key, "g"), value);
        }
      });
    }
    return html;
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

  protected onPressed = () => {
    this.updateRootClass("pressed", true);
  };

  protected onUnpressed = () => {
    this.updateRootClass("pressed", false);
  };

  protected bindFocus(el: HTMLElement) {
    el.addEventListener("pressed", this.onPressed);
    el.addEventListener("unpressed", this.onUnpressed);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("focus", this.onFocus);
    el.addEventListener("blur", this.onBlur);
    if (!isServer()) {
      el.addEventListener("click", this.onActivationClick);
    }
  }

  protected unbindFocus(el: HTMLElement) {
    el.removeEventListener("pressed", this.onPressed);
    el.removeEventListener("unpressed", this.onUnpressed);
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
    const className = this.aliases[name] ?? name;
    if (className === "aria-label") {
      this.updateRootAttribute(className, newValue);
    } else {
      const transformer = STYLE_TRANSFORMERS[className];
      if (transformer) {
        this.updateStyleAttribute(className, newValue, transformer);
        if (className === "text-size") {
          // Setting text-size should also set line-height
          this.updateStyleAttribute(
            "text-size--line-height",
            newValue,
            getCssTextSizeHeight
          );
        }
        if (className === "text-overflow") {
          // Setting text-overflow should also set white-space
          this.updateStyleAttribute(
            "text-wrap",
            newValue,
            getCssTextWhiteSpace
          );
        }
        if (className === "selectable") {
          // Setting selectable should also set cursor
          if (newValue === "auto") {
            this.updateStyleAttribute("selectable--cursor", "text");
          } else {
            this.updateStyleAttribute("selectable--cursor", null);
          }
        }
        if (className === "interactable") {
          // Setting interactable should also set cursor
          if (newValue === "auto") {
            this.updateStyleAttribute("interactable--cursor", "pointer");
          } else {
            this.updateStyleAttribute("interactable--cursor", null);
          }
        }
        if (className === "overflow-x") {
          this.updateRootClass("overflow-x--scroll", newValue === "scroll");
        }
        if (className === "overflow-y") {
          this.updateRootClass("overflow-y--scroll", newValue === "scroll");
        }
        if (
          className === "text-stroke-width" ||
          className === "text-stroke-color"
        ) {
          const width = this._textStrokeWidth || "1";
          this.updateRootCssVariable("--text-stroke", getCssTextStroke(width));
        }
      }
    }
    this.onAttributeChanged(name, oldValue, newValue);
  }

  protected onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ) {}

  /**
   * Invoked each time the custom element is appended into a document-connected element.
   * (This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.)
   */
  protected connectedCallback(): void {
    this.bindFocus(this.root);
    this.contentSlot?.addEventListener(
      "slotchange",
      this.handleContentSlotChange
    );
    this.onConnected();
    window.setTimeout(() => {
      this.parsedCallback();
    });
  }

  protected onConnected(): void {}

  protected parsedCallback(): void {
    this.onParsed();
  }

  protected onParsed(): void {}

  /**
   * Invoked each time the custom element is disconnected from the document's DOM.
   */
  protected disconnectedCallback(): void {
    this.unbindFocus(this.root);
    this.contentSlot?.removeEventListener(
      "slotchange",
      this.handleContentSlotChange
    );
    this.unbindItems();
    this.onDisconnected();
  }

  protected onDisconnected(): void {}

  protected handleContentSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.unbindItems();
    this._items = slot
      ?.assignedElements?.()
      .filter(
        (el) =>
          el instanceof HTMLElement &&
          !(
            el.inert ||
            el.hidden ||
            (el.shadowRoot?.firstElementChild as HTMLElement)?.inert ||
            (el.shadowRoot?.firstElementChild as HTMLElement)?.hidden
          )
      ) as HTMLElement[];
    this.bindItems();
    this.onContentAssigned(slot);
  };

  protected onContentAssigned(slot: HTMLSlotElement): void {}

  bindItems(): void {
    this._items.forEach((item) => {
      item.addEventListener("keydown", this.onKeyDown);
    });
  }

  unbindItems(): void {
    this._items.forEach((item) => {
      item.removeEventListener("keydown", this.onKeyDown);
    });
  }

  onKeyDown = (e: KeyboardEvent): void => {
    const target = e.currentTarget;
    if (this._navigation === "keyboard") {
      if (target instanceof HTMLElement) {
        const dir = this._childLayout;
        switch (e.key) {
          case navPrevKey(dir):
            {
              e.preventDefault();
              this.focusPreviousItem(target);
            }
            break;
          case navNextKey(dir):
            {
              e.preventDefault();
              this.focusNextItem(target);
            }
            break;
          case navStartKey():
            {
              const firstItem = this.items[0];
              if (firstItem) {
                e.preventDefault();
                firstItem.focus();
              }
            }
            break;
          case navEndKey():
            {
              const lastItem = this.items[this.items.length - 1];
              if (lastItem) {
                e.preventDefault();
                lastItem.focus();
              }
            }
            break;
          default:
            break;
        }
      }
    }
  };

  focusPreviousItem(item: HTMLElement) {
    const firstItem = this.items[0];
    const lastItem = this.items[this.items.length - 1];
    if (item === firstItem) {
      if (lastItem) {
        lastItem.focus();
      }
    } else {
      const index = this.items.indexOf(item);
      const prevItem = this.items[index - 1];
      if (prevItem) {
        prevItem.focus();
      }
    }
  }

  focusNextItem(item: HTMLElement) {
    const firstItem = this.items[0];
    const lastItem = this.items[this.items.length - 1];
    if (item === lastItem) {
      if (firstItem) {
        firstItem.focus();
      }
    } else {
      const index = this.items.indexOf(item);
      const nextItem = this.items[index + 1];
      if (nextItem) {
        nextItem.focus();
      }
    }
  }

  getElementByTag<T extends HTMLElement>(name: string): T | null {
    return this.shadowRoot?.querySelector<T>(name) || null;
  }

  getElementByClass<T extends HTMLElement>(name: string): T | null {
    return this.shadowRoot?.querySelector<T>(`.${name}`) || null;
  }

  getSlotByName<T extends HTMLElement>(name: string): T | null {
    return this.shadowRoot?.querySelector<T>(`slot[name=${name}]`) || null;
  }

  getAssignedToSlot<T extends ChildNode>(name?: string): T[] {
    return Array.from(this.childNodes).filter((n) =>
      isAssignedToSlot(n, name)
    ) as T[];
  }

  setAssignedToSlot(textContent: string, name?: string): void {
    const assigned = this.getAssignedToSlot(name);
    assigned.forEach((n) => {
      this.removeChild(n);
    });
    if (name) {
      const newNode = document.createElement("div");
      newNode.setAttribute("slot", name);
      newNode.textContent = textContent;
      newNode.style.display = "contents";
      this.appendChild(newNode);
    } else {
      const newNode = document.createTextNode(textContent);
      this.appendChild(newNode);
    }
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

  updateRootCssVariable(name: string, value: string | null) {
    const varName = name.startsWith("--") ? name : `--${name}`;
    this.root.style.setProperty(varName, value ?? null);
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
      this.updateRootCssVariable(varName, formattedValue);
    } else {
      this.updateRootCssVariable(varName, null);
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

  getNumberAttribute(name: string, emptyValue = 0): number | null {
    const value = this.getAttribute(name);
    return value != null ? getUnitlessValue(value, emptyValue) : null;
  }

  setNumberAttribute(name: string, value: number | null): void | null {
    if (value != null) {
      this.setAttribute(name, String(value));
    } else {
      this.removeAttribute(name);
    }
  }
}
