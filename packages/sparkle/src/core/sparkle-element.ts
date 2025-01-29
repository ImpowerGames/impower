import STYLE_ALIASES from "../../../sparkle-style-transformer/src/constants/STYLE_ALIASES";
import STYLE_TRANSFORMERS from "../../../sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS";
import getCssPattern from "../../../sparkle-style-transformer/src/utils/getCssPattern";
import getCssTextStroke from "../../../sparkle-style-transformer/src/utils/getCssTextStroke";
import { Component } from "../../../spec-component/src/component";
import { Properties } from "../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../spec-component/src/utils/getKeys";
import getUnitlessValue from "../../../spec-component/src/utils/getUnitlessValue";
import { ARIA_PROPERTY_NAME_MAP } from "../constants/ARIA_ATTRIBUTES";
import { AnimationName } from "../types/animationName";
import { ColorName } from "../types/colorName";
import { EasingName } from "../types/easingName";
import { GradientName } from "../types/gradientName";
import { LayerName } from "../types/layerName";
import { MaskName } from "../types/maskName";
import { PatternName } from "../types/patternName";
import { RatioName } from "../types/ratioName";
import { SizeName } from "../types/sizeName";
import { pointerPress, shouldShowStrongFocus } from "../utils/focus";
import { isAssignedToSlot } from "../utils/isAssignedToSlot";
import { updateAttribute } from "../utils/updateAttribute";
import spec from "./_sparkle-element";

export const DEFAULT_SPARKLE_ATTRIBUTES = {
  rtl: "rtl",
  disabled: "disabled",
  ...getAttributeNameMap(getKeys(STYLE_TRANSFORMERS)),
  ...ARIA_PROPERTY_NAME_MAP,
};

export const DEFAULT_SPARKLE_TRANSFORMERS = {
  ...STYLE_TRANSFORMERS,
  "background-pattern": (v: string) => getCssPattern(v),
};

const DEFAULT_SPARKLE_ALIAS_ATTRIBUTES = getAttributeNameMap(
  getKeys(STYLE_ALIASES)
);

type SparkleProps = Record<keyof typeof DEFAULT_SPARKLE_ATTRIBUTES, unknown>;

export default class SparkleElement
  extends Component(spec)
  implements Properties<typeof DEFAULT_SPARKLE_ATTRIBUTES>
{
  static override get attrs() {
    return DEFAULT_SPARKLE_ATTRIBUTES;
  }

  get transformers(): Record<string, (v: string) => string> {
    return DEFAULT_SPARKLE_TRANSFORMERS;
  }

  get aliases(): Record<string, string> {
    return STYLE_ALIASES;
  }

  override get props() {
    return super.props as SparkleProps;
  }

  static override get observedAttributes() {
    return Object.values({
      ...this.attrs,
      ...DEFAULT_SPARKLE_ALIAS_ATTRIBUTES,
    });
  }

  /**
   * Whether or not the element should display content right-to-left instead of the usual left-to-right.
   */
  get rtl(): boolean {
    return this.getBooleanAttribute(SparkleElement.attrs.rtl);
  }
  set rtl(value) {
    this.setStringAttribute(SparkleElement.attrs.rtl, value);
  }

  /**
   * Whether or not the element is disabled.
   */
  get disabled(): boolean {
    return this.getBooleanAttribute(SparkleElement.attrs.disabled);
  }
  set disabled(value) {
    this.setStringAttribute(SparkleElement.attrs.disabled, value);
  }

  /**
   * Sets the element's `visibility` to be hidden.
   */
  get invisible(): boolean | string {
    return this.getConditionalAttribute(SparkleElement.attrs.invisible);
  }
  set invisible(value) {
    this.setStringAttribute(SparkleElement.attrs.invisible, value);
  }

  /**
   * Allows this element to capture `pointer-events`.
   */
  get interactable(): boolean | string {
    return this.getConditionalAttribute(SparkleElement.attrs.interactable);
  }
  set interactable(value) {
    this.setStringAttribute(SparkleElement.attrs.interactable, value);
  }

  /**
   * Enables `user-select` so the user can select any text inside this element.
   */
  get selectable(): boolean | string {
    return this.getConditionalAttribute(SparkleElement.attrs.selectable);
  }
  set selectable(value) {
    this.setStringAttribute(SparkleElement.attrs.selectable, value);
  }

  /**
   * Determines how the element will be displayed.
   */
  get display():
    | ""
    | "block"
    | "inline-block"
    | "inline"
    | "flex"
    | "inline-flex"
    | "table"
    | "inline-table"
    | "table-caption"
    | "table-cell"
    | "table-column"
    | "table-column-group"
    | "table-footer-group"
    | "table-header-group"
    | "table-row-group"
    | "table-row"
    | "flow-root"
    | "grid"
    | "inline-grid"
    | "contents"
    | "list-item"
    | "none"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.display);
  }
  set display(value) {
    this.setStringAttribute(SparkleElement.attrs.display, value);
  }

  /**
   * Sets this element's `position` in a document.
   */
  get position():
    | ""
    | "default"
    | "relative"
    | "fixed"
    | "absolute"
    | "sticky"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.position);
  }
  set position(value) {
    this.setStringAttribute(SparkleElement.attrs.position, value);
  }

  /**
   * Sets a preferred `aspect-ratio` for the element.
   */
  get aspect(): "" | RatioName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.aspect);
  }
  set aspect(value) {
    this.setStringAttribute(SparkleElement.attrs.aspect, value);
  }

  /**
   * Sets the desired `overflow` behavior for content that does not fit within this element's width or height.
   *
   * If not provided a value, defaults to `visible`.
   */
  get overflow(): "" | "visible" | "scroll" | "clip" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.overflow);
  }
  set overflow(value) {
    this.setStringAttribute(SparkleElement.attrs.overflow, value);
  }

  /**
   * Sets the desired `overflow` behavior for content that does not fit within this element's width.
   *
   * If not provided a value, defaults to `visible`.
   */
  get overflowX(): "" | "visible" | "scroll" | "clip" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.overflowX);
  }
  set overflowX(value) {
    this.setStringAttribute(SparkleElement.attrs.overflowX, value);
  }

  /**
   * Sets the desired `overflow` behavior for content that does not fit within this element's height.
   *
   * If not provided a value, defaults to `visible`.
   */
  get overflowY(): "" | "visible" | "scroll" | "clip" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.overflowY);
  }
  set overflowY(value) {
    this.setStringAttribute(SparkleElement.attrs.overflowY, value);
  }

  /**
   * Sets the `z-index` of a positioned element and its descendants.
   * Elements with a larger z value appear on top of those with a smaller one.
   */
  get z(): "" | "0" | "1" | LayerName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.z);
  }
  set z(value) {
    this.setStringAttribute(SparkleElement.attrs.z, value);
  }

  /**
   * Sets this element's `width`.
   */
  get width(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.width);
  }
  set width(value) {
    this.setStringAttribute(SparkleElement.attrs.width, value);
  }

  /**
   * Sets the `min-width` of this element.
   * Prevents the element's width from becoming smaller than the value specified.
   */
  get widthMin(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.widthMin);
  }
  set widthMin(value) {
    this.setStringAttribute(SparkleElement.attrs.widthMin, value);
  }

  /**
   * Sets the `max-width` of this element.
   * Prevents the element's width from becoming larger than the value specified.
   */
  get widthMax(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.widthMax);
  }
  set widthMax(value) {
    this.setStringAttribute(SparkleElement.attrs.widthMax, value);
  }

  /**
   * Sets this element's `height`.
   */
  get height(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.height);
  }
  set height(value) {
    this.setStringAttribute(SparkleElement.attrs.height, value);
  }

  /**
   * Sets the `min-height` of this element.
   * Prevents the element's height from becoming smaller than the value specified.
   */
  get heightMin(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.heightMin);
  }
  set heightMin(value) {
    this.setStringAttribute(SparkleElement.attrs.heightMin, value);
  }

  /**
   * Sets the `max-height` of this element.
   * Prevents the element's height from becoming larger than the value specified.
   */
  get heightMax(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.heightMax);
  }
  set heightMax(value) {
    this.setStringAttribute(SparkleElement.attrs.heightMax, value);
  }

  /**
   * Rounds the corners of this element by specifying a `border-radius`.
   *
   * @summary c
   */
  get corner(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.corner);
  }
  set corner(value) {
    this.setStringAttribute(SparkleElement.attrs.corner, value);
  }

  /**
   * Rounds the top-left and top-right corners of this element by specifying a `border-top-left-radius` and `border-top-right-radius`.
   *
   * @summary c-t
   */
  get cornerT(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerT);
  }
  set cornerT(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerT, value);
  }

  /**
   * Rounds the top-right and bottom-right corners of this element by specifying a `border-top-right-radius` and `border-bottom-right-radius`.
   *
   * @summary c-r
   */
  get cornerR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerR);
  }
  set cornerR(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerR, value);
  }

  /**
   * Rounds the bottom-left and bottom-right corners of this element by specifying a `border-bottom-left-radius` and `border-bottom-right-radius`.
   *
   * @summary c-b
   */
  get cornerB(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerB);
  }
  set cornerB(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerB, value);
  }

  /**
   * Rounds the top-left and bottom-left corners of this element by specifying a `border-top-left-radius` and `border-bottom-left-radius`.
   *
   * @summary c-l
   */
  get cornerL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerL);
  }
  set cornerL(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerL, value);
  }

  /**
   * Rounds the top-left corner of this element by specifying a `border-top-left-radius`.
   *
   * @summary c-tl
   */
  get cornerTL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerTL);
  }
  set cornerTL(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerTL, value);
  }

  /**
   * Rounds the top-right corner of this element by specifying a `border-top-right-radius`.
   *
   * @summary c-tr
   */
  get cornerTR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerTR);
  }
  set cornerTR(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerTR, value);
  }

  /**
   * Rounds the bottom-right corner of this element by specifying a `border-bottom-right-radius`.
   *
   * @summary c-br
   */
  get cornerBR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerBR);
  }
  set cornerBR(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerBR, value);
  }

  /**
   * Rounds the bottom-left corner of this element by specifying a `border-bottom-left-radius`.
   *
   * @summary c-bl
   */
  get cornerBL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.cornerBL);
  }
  set cornerBL(value) {
    this.setStringAttribute(SparkleElement.attrs.cornerBL, value);
  }

  /**
   * Sets how far the `top` `right` `bottom` and `left` edges of this element are from the corresponding edges of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i
   */
  get inset(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.inset);
  }
  set inset(value) {
    this.setStringAttribute(SparkleElement.attrs.inset, value);
  }

  /**
   * Sets how far the `top` edge of this element is from the top edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-t
   */
  get insetT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetT);
  }
  set insetT(value) {
    this.setStringAttribute(SparkleElement.attrs.insetT, value);
  }

  /**
   * Sets how far the `right` edge of this element is from the right edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-r
   */
  get insetR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetR);
  }
  set insetR(value) {
    this.setStringAttribute(SparkleElement.attrs.insetR, value);
  }

  /**
   * Sets how far the `bottom` edge of this element is from the bottom edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-b
   */
  get insetB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetB);
  }
  set insetB(value) {
    this.setStringAttribute(SparkleElement.attrs.insetB, value);
  }

  /**
   * Sets how far the `left` edge of this element is from the left edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-l
   */
  get insetL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetL);
  }
  set insetL(value) {
    this.setStringAttribute(SparkleElement.attrs.insetL, value);
  }

  /**
   * Sets how far the `left` and `right` edge of this element is from the left and right edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-lr
   */
  get insetLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetLR);
  }
  set insetLR(value) {
    this.setStringAttribute(SparkleElement.attrs.insetLR, value);
  }

  /**
   * Sets how far the `top` and `bottom` edge of this element is from the top and bottom edge of its closest positioned parent.
   * It has no effect on non-positioned elements.
   *
   * @summary i-tb
   */
  get insetTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.insetTB);
  }
  set insetTB(value) {
    this.setStringAttribute(SparkleElement.attrs.insetTB, value);
  }

  /**
   * Sets the `outline-width` of this element.
   *
   * @summary o-width
   */
  get outlineWidth(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.outlineWidth);
  }
  set outlineWidth(value) {
    this.setStringAttribute(SparkleElement.attrs.outlineWidth, value);
  }

  /**
   * Sets the `outline-color` of this element.
   */
  get outlineColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.outlineColor);
  }
  set outlineColor(value) {
    this.setStringAttribute(SparkleElement.attrs.outlineColor, value);
  }

  /**
   * Sets the `outline-style` of this element.
   *
   * @summary o-style
   */
  get outlineStyle(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.outlineStyle);
  }
  set outlineStyle(value) {
    this.setStringAttribute(SparkleElement.attrs.outlineStyle, value);
  }

  /**
   * Sets the `border-width` of this element.
   *
   * @summary b-width
   */
  get borderWidth(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidth);
  }
  set borderWidth(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidth, value);
  }

  /**
   * Sets the `border-top-width` of this element.
   *
   * @summary b-width-t
   */
  get borderWidthT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthT);
  }
  set borderWidthT(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthT, value);
  }

  /**
   * Sets the `border-right-width` of this element.
   *
   * @summary b-width-r
   */
  get borderWidthR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthR);
  }
  set borderWidthR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthR, value);
  }

  /**
   * Sets the `border-bottom-width` of this element.
   *
   * @summary b-width-b
   */
  get borderWidthB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthB);
  }
  set borderWidthB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthB, value);
  }

  /**
   * Sets the `border-left-width` of this element.
   *
   * @summary b-width-l
   */
  get borderWidthL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthL);
  }
  set borderWidthL(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthL, value);
  }

  /**
   * Sets the `border-left-width` and `border-right-width` of this element.
   *
   * @summary b-width-lr
   */
  get borderWidthLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthLR);
  }
  set borderWidthLR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthLR, value);
  }

  /**
   * Sets the `border-top-width` and `border-bottom-width` of this element.
   *
   * @summary b-width-tb
   */
  get borderWidthTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderWidthTB);
  }
  set borderWidthTB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderWidthTB, value);
  }

  /**
   * Sets the `border-color` of this element.
   */
  get borderColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColor);
  }
  set borderColor(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColor, value);
  }

  /**
   * Sets the `border-top-color` of this element.
   *
   * @summary b-color-t
   */
  get borderColorT(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorT);
  }
  set borderColorT(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorT, value);
  }

  /**
   * Sets the `border-right-color` of this element.
   *
   * @summary b-color-r
   */
  get borderColorR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorR);
  }
  set borderColorR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorR, value);
  }

  /**
   * Sets the `border-bottom-color` of this element.
   *
   * @summary b-color-b
   */
  get borderColorB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorB);
  }
  set borderColorB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorB, value);
  }

  /**
   * Sets the `border-left-color` of this element.
   *
   * @summary b-color-l
   */
  get borderColorL(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorL);
  }
  set borderColorL(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorL, value);
  }

  /**
   * Sets the `border-top-color` and `border-bottom-color` of this element.
   *
   * @summary b-color-tb
   */
  get borderColorTB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorTB);
  }
  set borderColorTB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorTB, value);
  }

  /**
   * Sets the `border-left-color` and `border-right-color` of this element.
   *
   * @summary b-color-lr
   */
  get borderColorLR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderColorLR);
  }
  set borderColorLR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderColorLR, value);
  }

  /**
   * Sets the `border-style` of this element.
   *
   * @summary b-style
   */
  get borderStyle(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyle);
  }
  set borderStyle(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyle, value);
  }

  /**
   * Sets the `border-top-style` of this element.
   *
   * @summary b-style-t
   */
  get borderStyleT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleT);
  }
  set borderStyleT(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleT, value);
  }

  /**
   * Sets the `border-right-style` of this element.
   *
   * @summary b-style-r
   */
  get borderStyleR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleR);
  }
  set borderStyleR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleR, value);
  }

  /**
   * Sets the `border-bottom-style` of this element.
   *
   * @summary b-style-b
   */
  get borderStyleB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleB);
  }
  set borderStyleB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleB, value);
  }

  /**
   * Sets the `border-left-style` of this element.
   *
   * @summary b-style-l
   */
  get borderStyleL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleL);
  }
  set borderStyleL(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleL, value);
  }

  /**
   * Sets the `border-left-style` and `border-right-style` of this element.
   *
   * @summary b-style-lr
   */
  get borderStyleLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleLR);
  }
  set borderStyleLR(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleLR, value);
  }

  /**
   * Sets the `border-top-style` and `border-bottom-style` of this element.
   *
   * @summary b-style-tb
   */
  get borderStyleTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.borderStyleTB);
  }
  set borderStyleTB(value) {
    this.setStringAttribute(SparkleElement.attrs.borderStyleTB, value);
  }

  /**
   * Sets the `margin` area around this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m
   */
  get margin(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.margin);
  }
  set margin(value) {
    this.setStringAttribute(SparkleElement.attrs.margin, value);
  }

  /**
   * Sets the `margin-top` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-t
   */
  get marginT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginT);
  }
  set marginT(value) {
    this.setStringAttribute(SparkleElement.attrs.marginT, value);
  }

  /**
   * Sets the `margin-right` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-r
   */
  get marginR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginR);
  }
  set marginR(value) {
    this.setStringAttribute(SparkleElement.attrs.marginR, value);
  }

  /**
   * Sets the `margin-bottom` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-b
   */
  get marginB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginB);
  }
  set marginB(value) {
    this.setStringAttribute(SparkleElement.attrs.marginB, value);
  }

  /**
   * Sets the `margin-left` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-l
   */
  get marginL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginL);
  }
  set marginL(value) {
    this.setStringAttribute(SparkleElement.attrs.marginL, value);
  }

  /**
   * Sets the `margin-left` and `margin-right` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-lr
   */
  get marginLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginLR);
  }
  set marginLR(value) {
    this.setStringAttribute(SparkleElement.attrs.marginLR, value);
  }

  /**
   * Sets the `margin-top` and `margin-bottom` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-tb
   */
  get marginTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.marginTB);
  }
  set marginTB(value) {
    this.setStringAttribute(SparkleElement.attrs.marginTB, value);
  }

  /**
   * Sets the `padding` area around this element.
   *
   * @summary p
   */
  get padding(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.padding);
  }
  set padding(value) {
    this.setStringAttribute(SparkleElement.attrs.padding, value);
  }

  /**
   * Sets the `padding-top` area of this element.
   *
   * @summary p-t
   */
  get paddingT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingT);
  }
  set paddingT(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingT, value);
  }

  /**
   * Sets the `padding-right` area of this element.
   *
   * @summary p-r
   */
  get paddingR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingR);
  }
  set paddingR(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingR, value);
  }

  /**
   * Sets the `padding-bottom` area of this element.
   *
   * @summary p-b
   */
  get paddingB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingB);
  }
  set paddingB(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingB, value);
  }

  /**
   * Sets the `padding-left` area of this element.
   *
   * @summary p-l
   */
  get paddingL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingL);
  }
  set paddingL(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingL, value);
  }

  /**
   * Sets the `padding-left` and `padding-right` areas of this element.
   *
   * @summary p-lr
   */
  get paddingLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingLR);
  }
  set paddingLR(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingLR, value);
  }

  /**
   * Sets the `padding-top` and `padding-bottom` areas of this element.
   *
   * @summary p-tb
   */
  get paddingTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.paddingTB);
  }
  set paddingTB(value) {
    this.setStringAttribute(SparkleElement.attrs.paddingTB, value);
  }

  /**
   * Sets the `flex-direction` of this element so that its children are arranged in either a row or column.
   */
  get childLayout():
    | "row"
    | "column"
    | "row-reverse"
    | "column-reverse"
    | null {
    return this.getStringAttribute(SparkleElement.attrs.childLayout);
  }
  set childLayout(value) {
    this.setStringAttribute(SparkleElement.attrs.childLayout, value);
  }

  /**
   * Sets the `gap` between children.
   */
  get childGap(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.childGap);
  }
  set childGap(value) {
    this.setStringAttribute(SparkleElement.attrs.childGap, value);
  }

  /**
   * Uses `align-items` to align children along the cross axis.
   *
   * When layout is `column`, this controls all children's horizontal alignment.
   * When layout is `row`, this controls all children's vertical alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get childAlign():
    | ""
    | "center"
    | "stretch"
    | "start"
    | "end"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.childAlign);
  }
  set childAlign(value) {
    this.setStringAttribute(SparkleElement.attrs.childAlign, value);
  }

  /**
   * Uses `justify-content` to align children along the main axis.
   *
   * When layout is `column`, this controls all children's vertical alignment.
   * When layout is `row`, this controls all children's horizontal alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get childJustify():
    | ""
    | "center"
    | "stretch"
    | "start"
    | "end"
    | "between"
    | "around"
    | "evenly"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.childJustify);
  }
  set childJustify(value) {
    this.setStringAttribute(SparkleElement.attrs.childJustify, value);
  }

  /**
   * Sets the desired `flex-wrap` behavior if any children do not fit within the width of this element.
   *
   * If not provided a value, defaults to `wrap`.
   */
  get childOverflow():
    | ""
    | "visible"
    | "wrap"
    | "wrap-reverse"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.childOverflow);
  }
  set childOverflow(value) {
    this.setStringAttribute(SparkleElement.attrs.childOverflow, value);
  }

  /**
   * Uses `align-self` to override the alignment for this element along the cross axis.
   *
   * When layout is `column`, this controls the horizontal alignment.
   * When layout is `row`, this controls the vertical alignment.
   *
   * If not provided a value, defaults to `center`.
   */
  get selfAlign(): "" | "center" | "stretch" | "start" | "end" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.selfAlign);
  }
  set selfAlign(value) {
    this.setStringAttribute(SparkleElement.attrs.selfAlign, value);
  }

  /**
   * Uses `flex` to control how much the element will flex.
   *
   * If not provided a value, defaults to `1`.
   */
  get flex(): "" | "0" | "1" | "2" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.flex);
  }
  set flex(value) {
    this.setStringAttribute(SparkleElement.attrs.flex, value);
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
  get grow(): "" | "0" | "1" | "2" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.grow);
  }
  set grow(value) {
    this.setStringAttribute(SparkleElement.attrs.grow, value);
  }

  /**
   * Uses `flex-shrink` to control how much the element will shrink when there is not enough space available in its parent container.
   *
   * If 0, the element will not shrink.
   * If 1, the element will shrink as much as possible.
   *
   * If not provided a value, defaults to `0`.
   */
  get shrink(): "" | "0" | "1" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.shrink);
  }
  set shrink(value) {
    this.setStringAttribute(SparkleElement.attrs.shrink, value);
  }

  /**
   * Sets the `color` of content rendered inside this element.
   */
  get color(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.color);
  }
  set color(value) {
    this.setStringAttribute(SparkleElement.attrs.color, value);
  }

  /**
   * Specifies which `font-family` this element will use to render text.
   */
  get textFont(): "" | "sans" | "serif" | "mono" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textFont);
  }
  set textFont(value) {
    this.setStringAttribute(SparkleElement.attrs.textFont, value);
  }

  /**
   * Sets the `font-size` of all text inside this element.
   */
  get textSize():
    | ""
    | "2xs"
    | SizeName
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "8xl"
    | "9xl"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textSize);
  }
  set textSize(value) {
    this.setStringAttribute(SparkleElement.attrs.textSize, value);
  }

  /**
   * Sets the `line-height` of all text inside this element.
   *
   * This is commonly used to increase or decrease the distance between lines of text.
   */
  get textLeading(): "" | "none" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textLeading);
  }
  set textLeading(value) {
    this.setStringAttribute(SparkleElement.attrs.textLeading, value);
  }

  /**
   * Sets the `letter-spacing` of all text inside this element.
   *
   * This value is added to the font's natural letter spacing.
   * Positive values cause letters to spread farther apart, while negative values bring letters closer together.
   */
  get textKerning(): "" | "none" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textKerning);
  }
  set textKerning(value) {
    this.setStringAttribute(SparkleElement.attrs.textKerning, value);
  }

  /**
   * Sets the `font-weight` of all text inside this element.
   */
  get textWeight():
    | ""
    | "thin"
    | "extralight"
    | "light"
    | "normal"
    | "medium"
    | "semibold"
    | "bold"
    | "extrabold"
    | "black"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textWeight);
  }
  set textWeight(value) {
    this.setStringAttribute(SparkleElement.attrs.textWeight, value);
  }

  /**
   * Sets the `text-style` of all text inside this element so that the text is italic.
   */
  get textItalic(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textItalic);
  }
  set textItalic(value) {
    this.setStringAttribute(SparkleElement.attrs.textItalic, value);
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders underneath the text.
   */
  get textUnderline(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textUnderline);
  }
  set textUnderline(value) {
    this.setStringAttribute(SparkleElement.attrs.textUnderline, value);
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders through the middle of the text.
   */
  get textStrikethrough(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textStrikethrough);
  }
  set textStrikethrough(value) {
    this.setStringAttribute(SparkleElement.attrs.textStrikethrough, value);
  }

  /**
   * Sets the `text-transform` of all text inside this element to force the text to be uppercase, lowercase, or capitalized.
   */
  get textCase():
    | ""
    | "uppercase"
    | "lowercase"
    | "capitalize"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textCase);
  }
  set textCase(value) {
    this.setStringAttribute(SparkleElement.attrs.textCase, value);
  }

  /**
   * Sets the desired `text-align` behavior of all text inside this element.
   *
   * Aligns text to the center, start, or end, or justifies it to fill the width of this element.
   *
   * If not provided a value, defaults to `center`.
   */
  get textAlign(): "" | "center" | "start" | "end" | "justify" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textAlign);
  }
  set textAlign(value) {
    this.setStringAttribute(SparkleElement.attrs.textAlign, value);
  }

  /**
   * Sets the desired `text-overflow` and `white-space` behavior if text cannot fit on a single line.
   *
   * If not provided a value, defaults to `visible`.
   */
  get textOverflow():
    | ""
    | "visible"
    | "wrap"
    | "clip"
    | "ellipsis"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textOverflow);
  }
  set textOverflow(value) {
    this.setStringAttribute(SparkleElement.attrs.textOverflow, value);
  }

  /**
   * Sets the desired `white-space` behavior.
   *
   * If not provided a value, defaults to `normal`.
   */
  get textWhitespace():
    | ""
    | "normal"
    | "nowrap"
    | "pre"
    | "pre-wrap"
    | "pre-line"
    | "break-spaces"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textWhitespace);
  }
  set textWhitespace(value) {
    this.setStringAttribute(SparkleElement.attrs.textWhitespace, value);
  }

  /**
   * Sets the `color` of text rendered inside this element.
   */
  get textColor(): "" | "wrap" | "nowrap" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textColor);
  }
  set textColor(value) {
    this.setStringAttribute(SparkleElement.attrs.textColor, value);
  }

  /**
   * Uses `text-shadow` to create a colored stroke around the text.
   */
  get textStrokeColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textStrokeColor);
  }
  set textStrokeColor(value) {
    this.setStringAttribute(SparkleElement.attrs.textStrokeColor, value);
  }

  /**
   * Sets the width of the stroke rendered around the text.
   */
  get textStrokeWidth():
    | ""
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
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.textStrokeWidth);
  }
  set textStrokeWidth(value) {
    this.setStringAttribute(SparkleElement.attrs.textStrokeWidth, value);
  }

  /**
   * Sets the `text-underline-offset` of all underlined text inside this element.
   */
  get textUnderlineOffset(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.textUnderlineOffset);
  }
  set textUnderlineOffset(value) {
    this.setStringAttribute(SparkleElement.attrs.textUnderlineOffset, value);
  }

  /**
   * Sets the `text-decoration-thickness` of all underline or strikethrough lines.
   */
  get textDecorationThickness(): "" | SizeName | string | null {
    return this.getStringAttribute(
      SparkleElement.attrs.textDecorationThickness
    );
  }
  set textDecorationThickness(value) {
    this.setStringAttribute(
      SparkleElement.attrs.textDecorationThickness,
      value
    );
  }

  /**
   * Sets the `background-color` of this element.
   *
   * @summary bg-color
   */
  get backgroundColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundColor);
  }
  set backgroundColor(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundColor, value);
  }

  /**
   * Uses `background-image` to display a color gradient as the background of this element.
   *
   * @summary bg-gradient
   */
  get backgroundGradient(): "" | GradientName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundGradient);
  }
  set backgroundGradient(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundGradient, value);
  }

  /**
   * Uses `background-image` to display a pattern as the background of this element.
   *
   * @summary bg-pattern
   */
  get backgroundPattern(): "" | PatternName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundPattern);
  }
  set backgroundPattern(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundPattern, value);
  }

  /**
   * Uses `background-image` to display an image inside this element.
   *
   * @summary bg-image
   */
  get backgroundImage(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundImage);
  }
  set backgroundImage(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundImage, value);
  }

  /**
   * Sets `background-repeat` to determine if images are repeated in a tiling pattern.
   *
   * If not provided a value, defaults to `repeat`.
   *
   * @summary bg-repeat
   */
  get backgroundRepeat(): "" | "repeat" | "x" | "y" | "none" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundRepeat);
  }
  set backgroundRepeat(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundRepeat, value);
  }

  /**
   * Sets `background-position` to align images to the center, top, bottom, left, or right edge of this element.
   *
   * If not provided a value, defaults to `center`.
   *
   * @summary bg-align
   */
  get backgroundAlign():
    | ""
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundAlign);
  }
  set backgroundAlign(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundAlign, value);
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
  get backgroundFit(): "" | "contain" | "cover" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.backgroundFit);
  }
  set backgroundFit(value) {
    this.setStringAttribute(SparkleElement.attrs.backgroundFit, value);
  }

  /**
   * Sets the `mask-image` of this element to change the visual shape of this element.
   * Parts that are inside the mask region are visible, while those outside are clipped.
   *
   * If not provided a value, defaults to `circle`.
   */
  get mask(): "" | MaskName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.mask);
  }
  set mask(value) {
    this.setStringAttribute(SparkleElement.attrs.mask, value);
  }

  /**
   * Adds a `drop-shadow` `filter` to this element.
   */
  get shadow(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.shadow);
  }
  set shadow(value) {
    this.setStringAttribute(SparkleElement.attrs.shadow, value);
  }

  /**
   * Adds an inner `box-shadow` to this element.
   */
  get shadowInset(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.shadowInset);
  }
  set shadowInset(value) {
    this.setStringAttribute(SparkleElement.attrs.shadowInset, value);
  }

  /**
   * Applies a `backdrop-filter` to this element.
   */
  get filter(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.filter);
  }
  set filter(value) {
    this.setStringAttribute(SparkleElement.attrs.filter, value);
  }

  /**
   * Sets the desired `mix-blend-mode` of this element to control how the colors of this element blend with the colors of everything behind it.
   */
  get blend():
    | ""
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
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.blend);
  }
  set blend(value) {
    this.setStringAttribute(SparkleElement.attrs.blend, value);
  }

  /**
   * Sets the `opacity` of an element to control how transparent it is,
   * with 0 being fully transparent and 1 being fully opaque.
   */
  get opacity(): "" | "0" | "0.5" | "1" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.opacity);
  }
  set opacity(value) {
    this.setStringAttribute(SparkleElement.attrs.opacity, value);
  }

  /**
   * Sets an element's `transform` to move it along the x-axis.
   */
  get translateX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.translateX);
  }
  set translateX(value) {
    this.setStringAttribute(SparkleElement.attrs.translateX, value);
  }

  /**
   * Sets an element's `transform` to move it along the y-axis.
   */
  get translateY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.translateY);
  }
  set translateY(value) {
    this.setStringAttribute(SparkleElement.attrs.translateY, value);
  }

  /**
   * Sets an element's `transform` to move it along the z-axis.
   */
  get translateZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.translateZ);
  }
  set translateZ(value) {
    this.setStringAttribute(SparkleElement.attrs.translateZ, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the x-axis.
   */
  get rotateX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.rotateX);
  }
  set rotateX(value) {
    this.setStringAttribute(SparkleElement.attrs.rotateX, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the y-axis.
   */
  get rotateY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.rotateY);
  }
  set rotateY(value) {
    this.setStringAttribute(SparkleElement.attrs.rotateY, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the z-axis.
   */
  get rotateZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.rotateZ);
  }
  set rotateZ(value) {
    this.setStringAttribute(SparkleElement.attrs.rotateZ, value);
  }

  /**
   * Sets an element's `rotate` angle.
   */
  get rotate(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.rotate);
  }
  set rotate(value) {
    this.setStringAttribute(SparkleElement.attrs.rotate, value);
  }

  /**
   * Sets an element's `transform` to scale it along the x-axis.
   */
  get scaleX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.scaleX);
  }
  set scaleX(value) {
    this.setStringAttribute(SparkleElement.attrs.scaleX, value);
  }

  /**
   * Sets an element's `transform` to scale it along the y-axis.
   */
  get scaleY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.scaleY);
  }
  set scaleY(value) {
    this.setStringAttribute(SparkleElement.attrs.scaleY, value);
  }

  /**
   * Sets an element's `transform` to scale it along the z-axis.
   */
  get scaleZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.scaleZ);
  }
  set scaleZ(value) {
    this.setStringAttribute(SparkleElement.attrs.scaleZ, value);
  }

  /**
   * Sets an element's `transform` to skew it along the x-axis.
   */
  get skewX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.skewX);
  }
  set skewX(value) {
    this.setStringAttribute(SparkleElement.attrs.skewX, value);
  }

  /**
   * Sets an element's `transform` to skew it along the y-axis.
   */
  get skewY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.skewY);
  }
  set skewY(value) {
    this.setStringAttribute(SparkleElement.attrs.skewY, value);
  }

  /**
   * Sets the `transform-origin` for any transformations applied to this element.
   */
  get pivot():
    | ""
    | "center"
    | "top"
    | "left"
    | "bottom"
    | "right"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.pivot);
  }
  set pivot(value) {
    this.setStringAttribute(SparkleElement.attrs.pivot, value);
  }

  /**
   * Specifies the `transition-delay` between property changes and their resulting transition animation.
   */
  get delay():
    | ""
    | "0"
    | "25ms"
    | "50ms"
    | "75ms"
    | "100ms"
    | "150ms"
    | "200ms"
    | "250ms"
    | "300ms"
    | "350ms"
    | "400ms"
    | "450ms"
    | "500ms"
    | "1s"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.delay);
  }
  set delay(value) {
    this.setStringAttribute(SparkleElement.attrs.delay, value);
  }

  /**
   * Specifies the `transition-duration` of property changes.
   */
  get duration():
    | ""
    | "0"
    | "25ms"
    | "50ms"
    | "75ms"
    | "100ms"
    | "150ms"
    | "200ms"
    | "250ms"
    | "300ms"
    | "350ms"
    | "400ms"
    | "450ms"
    | "500ms"
    | "1s"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attrs.duration);
  }
  set duration(value) {
    this.setStringAttribute(SparkleElement.attrs.duration, value);
  }

  /**
   * Specifies the `transition-timing-function` used for property changes.
   */
  get ease(): "" | EasingName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.ease);
  }
  set ease(value) {
    this.setStringAttribute(SparkleElement.attrs.ease, value);
  }

  /**
   * Applies an `animation` to this element.
   */
  get animation(): "" | AnimationName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.animation);
  }
  set animation(value) {
    this.setStringAttribute(SparkleElement.attrs.animation, value);
  }

  /**
   * Specifies an exit `animation` for this element.
   */
  get exit(): "" | AnimationName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.exit) || "exit";
  }
  set exit(value) {
    this.setStringAttribute(SparkleElement.attrs.exit, value);
  }

  /**
   * Specifies an enter `animation` for this element.
   */
  get enter(): "" | AnimationName | string | null {
    return this.getStringAttribute(SparkleElement.attrs.enter) || "enter";
  }
  set enter(value) {
    this.setStringAttribute(SparkleElement.attrs.enter, value);
  }

  /**
   * Specifies `content-visibility` for this element.
   */
  get contentVisibility(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.contentVisibility);
  }
  set contentVisibility(value) {
    this.setStringAttribute(SparkleElement.attrs.contentVisibility, value);
  }

  /**
   * Specifies `contain-intrinsic-size` for this element.
   */
  get containIntrinsicSize(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attrs.containIntrinsicSize);
  }
  set containIntrinsicSize(value) {
    this.setStringAttribute(SparkleElement.attrs.containIntrinsicSize, value);
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
  }

  protected unbindFocus(el: HTMLElement) {
    el.removeEventListener("pressed", this.onPressed);
    el.removeEventListener("unpressed", this.onUnpressed);
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("focus", this.onFocus);
    el.removeEventListener("blur", this.onBlur);
  }

  override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ) {
    this.propagateAttribute(name, newValue);
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  override connectedCallback() {
    if (this.shadowRoot) {
      this.contentSlot?.addEventListener(
        "slotchange",
        this.handleContentSlotAssigned
      );
    } else {
      this.handleContentChildrenAssigned(
        Array.from(this.contentSlot?.children || [])
      );
    }
    this.bindFocus(this.root);
    window.setTimeout(() => {
      this.onParsed();
    });
    super.connectedCallback();
  }

  override disconnectedCallback() {
    if (this.shadowRoot) {
      this.contentSlot?.removeEventListener(
        "slotchange",
        this.handleContentSlotAssigned
      );
    }
    this.unbindFocus(this.root);
    super.disconnectedCallback();
  }

  onParsed(): void {}

  override onRender() {
    for (let i = 0; i < this.attributes.length; i++) {
      const attr = this.attributes[i]!;
      this.propagateAttribute(attr.name, attr.value);
    }
  }

  protected handleContentSlotAssigned = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.handleContentChildrenAssigned(slot.assignedElements());
  };

  protected handleContentChildrenAssigned(children: Element[]) {
    this.onContentAssigned(children);
  }

  protected onContentAssigned(children: Element[]): void {}

  propagateAttribute(name: string, value: string) {
    const attrName: string = this.aliases[name] ?? name;
    if (
      attrName === "role" ||
      attrName === "tabindex" ||
      attrName.startsWith("aria-")
    ) {
      // Forward all aria attributes to root element
      this.updateRootAttribute(attrName, value);
    } else {
      const transformer = this.transformers[attrName];
      if (transformer) {
        this.updateStyleAttribute(attrName, value, transformer);
        if (
          attrName === SparkleElement.attrs.textStrokeWidth ||
          attrName === SparkleElement.attrs.textStrokeColor
        ) {
          const width = this.textStrokeWidth || "1";
          this.updateRootCssVariable("text-stroke", getCssTextStroke(width));
        }
      }
    }
  }

  getAssignedToSlot<T extends ChildNode>(name?: string): T[] {
    if (this.shadowRoot) {
      return Array.from(this.childNodes).filter((n) =>
        isAssignedToSlot(n, name)
      ) as T[];
    }
    if (name) {
      return Array.from(this.self.querySelectorAll(`[name=${name}]`)).flatMap(
        (slot) => Array.from(slot?.childNodes || []) as T[]
      );
    }
    return Array.from(this.contentSlot?.childNodes || []) as T[];
  }

  setAssignedToSlot(
    content: string | Node,
    name?: string,
    preserve?: (n: ChildNode) => boolean
  ): Node | null {
    const assigned = this.getAssignedToSlot(name);
    assigned.forEach((n) => {
      if (n.parentElement && (!preserve || !preserve(n))) {
        n.parentElement.removeChild(n);
      }
    });
    if (name) {
      const newNode = document.createElement("div");
      newNode.setAttribute("slot", name);
      newNode.style.display = "contents";
      if (typeof content === "string") {
        newNode.textContent = content;
      } else {
        newNode.appendChild(content);
      }
      if (this.shadowRoot) {
        return this.appendChild(newNode)?.firstElementChild;
      } else {
        return (
          this.self.querySelector(`[name=${name}]`)?.appendChild(newNode)
            ?.firstElementChild || null
        );
      }
    } else {
      const newNode =
        typeof content === "string"
          ? document.createTextNode(content)
          : content;
      if (this.shadowRoot) {
        return this.appendChild(newNode);
      } else {
        return this.contentSlot?.appendChild(newNode) || null;
      }
    }
  }

  updateRootCssVariable(name: string, value: string | null) {
    const varName = name.startsWith("--") ? name : `--${name}`;
    this.root.style.setProperty(varName, value ?? null);
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

  updateStyleAttribute(
    name: string,
    newValue: string | null,
    valueFormatter?: (v: string) => string
  ) {
    const varName = `--${name}`;
    const formattedValue =
      valueFormatter && newValue != null ? valueFormatter(newValue) : newValue;
    if (formattedValue) {
      this.updateRootCssVariable(varName, formattedValue);
    } else {
      this.updateRootCssVariable(varName, null);
    }
  }

  closestAncestor(selector: string, el: Element = this): Element | null {
    if (!el || el instanceof Document || el instanceof Window) {
      return null;
    }
    const result = el.closest(selector);
    if (result) {
      return result;
    }
    const host = (el.getRootNode() as ShadowRoot)?.host;
    if (!host || host === this || host === el) {
      return null;
    }
    return this.closestAncestor(selector, host);
  }

  getConditionalAttribute(name: string): string | boolean {
    const value = this.getAttribute(name);
    if (value == null) {
      return false;
    }
    if (value === "") {
      return true;
    }
    return value;
  }

  getBooleanAttribute<T extends boolean>(name: string): T {
    const value = this.getAttribute(name);
    return (value != null) as T;
  }

  setBooleanAttribute<T extends boolean>(name: string, value: T): void {
    if (typeof value === "string") {
      if (value === "") {
        this.setAttribute(name, "");
      } else {
        this.removeAttribute(name);
      }
    } else if (value) {
      this.setAttribute(name, "");
    } else {
      this.removeAttribute(name);
    }
  }

  getStringAttribute<T extends string>(name: string): T | null {
    const value = this.getAttribute(name);
    return (value != null ? value : null) as T;
  }

  setStringAttribute<T extends string>(
    name: T,
    value: T | number | boolean | null
  ): void {
    if (typeof value === "boolean") {
      if (value) {
        this.setAttribute(name, "");
      } else {
        this.removeAttribute(name);
      }
    } else if (value != null) {
      this.setAttribute(name, `${value}`);
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
