import { STYLE_ALIASES } from "../../../sparkle-transformer/src/constants/STYLE_ALIASES";
import { STYLE_TRANSFORMERS } from "../../../sparkle-transformer/src/constants/STYLE_TRANSFORMERS";
import { getCssPattern } from "../../../sparkle-transformer/src/utils/getCssPattern";
import { getCssTextStroke } from "../../../sparkle-transformer/src/utils/getCssTextStroke";
import Patterns from "../configs/patterns";
import Styles from "../configs/styles";
import { ARIA_ATTRIBUTE_NAME_MAP } from "../constants/ARIA_ATTRIBUTES";
import { CORE_CSS } from "../styles/core/core";
import { NORMALIZE_CSS } from "../styles/normalize/normalize";
import { ColorName } from "../types/colorName";
import { Properties } from "../types/properties";
import { SizeName } from "../types/sizeName";
import { dispatchActivationClick, isActivationClick } from "../utils/events";
import { pointerPress, shouldShowStrongFocus } from "../utils/focus";
import { getAttributeNameMap } from "../utils/getAttributeNameMap";
import { getKeys } from "../utils/getKeys";
import { getUnitlessValue } from "../utils/getUnitlessValue";
import { isAssignedToSlot } from "../utils/isAssignedToSlot";
import { isServer } from "../utils/isServer";
import { navEndKey } from "../utils/navEndKey";
import { navNextKey } from "../utils/navNextKey";
import { navPrevKey } from "../utils/navPrevKey";
import { navStartKey } from "../utils/navStartKey";
import { updateAttribute } from "../utils/updateAttribute";

export default class SparkleElement
  extends HTMLElement
  implements Properties<typeof STYLE_TRANSFORMERS>
{
  private static _tagName = "";
  static get tagName() {
    return this._tagName;
  }
  private static set tagName(value) {
    this._tagName = value;
  }

  private static _dependencies: Record<string, string> = {};
  static get dependencies() {
    return this._dependencies;
  }
  private static set dependencies(value) {
    this._dependencies = value;
  }

  private static _attributes = {
    rtl: "rtl",
    disabled: "disabled",
    loading: "loading",
    navigation: "navigation",
    ...ARIA_ATTRIBUTE_NAME_MAP,
    ...getAttributeNameMap(getKeys(STYLE_TRANSFORMERS)),
    ...getAttributeNameMap(getKeys(STYLE_ALIASES)),
  };
  static get attributes() {
    return this._attributes;
  }

  /**
   * Defines this component with the specified tag name.
   *
   * @param tagName - the tag name to use for this component.
   * @param dependencies - the tag names to use for the dependencies of this component.
   * @returns a promise that resolves when the named element is finished being defined.
   */
  static async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    if (tagName) {
      this.tagName = tagName;
    }
    if (dependencies) {
      this.dependencies = { ...this.dependencies, ...dependencies };
    }
    customElements.define(this.tagName, this);
    return customElements.whenDefined(this.tagName);
  }

  get html(): string {
    return `<div class="root" part="root"><slot class="content"></slot></div>`;
  }

  get styles(): CSSStyleSheet[] {
    return [];
  }

  get aliases(): Record<string, string> {
    return STYLE_ALIASES;
  }

  get transformers(): Record<string, (v: string) => string> {
    return {
      ...STYLE_TRANSFORMERS,
      "background-pattern": (v: string) => getCssPattern(v, Patterns.all()),
    };
  }

  static get observedAttributes() {
    return Object.values(this.attributes);
  }

  /**
   * Whether or not the element should display content right-to-left instead of the usual left-to-right.
   */
  get rtl(): boolean {
    return this.getBooleanAttribute(SparkleElement.attributes.rtl);
  }
  set rtl(value) {
    this.setStringAttribute(SparkleElement.attributes.rtl, value);
  }

  /**
   * Whether or not the element is disabled.
   */
  get disabled(): boolean {
    return this.getBooleanAttribute(SparkleElement.attributes.disabled);
  }
  set disabled(value) {
    this.setStringAttribute(SparkleElement.attributes.disabled, value);
  }

  /**
   * Whether or not the element is loading.
   */
  get loading(): boolean {
    return this.getBooleanAttribute(SparkleElement.attributes.loading);
  }
  set loading(value) {
    this.setStringAttribute(SparkleElement.attributes.loading, value);
  }

  /**
   * Sets the element's `visibility` to be hidden.
   */
  get invisible(): boolean | string {
    return this.getBooleanOrStringAttribute(
      SparkleElement.attributes.invisible
    );
  }
  set invisible(value) {
    this.setStringAttribute(SparkleElement.attributes.invisible, value);
  }

  /**
   * Allows this element to capture `pointer-events`.
   */
  get interactable(): boolean | string {
    return this.getBooleanOrStringAttribute(
      SparkleElement.attributes.interactable
    );
  }
  set interactable(value) {
    this.setStringAttribute(SparkleElement.attributes.interactable, value);
  }

  /**
   * Enables `user-select` so the user can select any text inside this element.
   */
  get selectable(): boolean | string {
    return this.getBooleanOrStringAttribute(
      SparkleElement.attributes.selectable
    );
  }
  set selectable(value) {
    this.setStringAttribute(SparkleElement.attributes.selectable, value);
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
    return this.getStringAttribute(SparkleElement.attributes.position);
  }
  set position(value) {
    this.setStringAttribute(SparkleElement.attributes.position, value);
  }

  /**
   * Sets a preferred `aspect-ratio` for the box.
   */
  get aspect():
    | ""
    | "square"
    | "landscape"
    | "portrait"
    | "widescreen"
    | "ultrawide"
    | "golden"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.aspect);
  }
  set aspect(value) {
    this.setStringAttribute(SparkleElement.attributes.aspect, value);
  }

  /**
   * Sets the desired `overflow` behavior for content that does not fit within this element's width.
   *
   * If not provided a value, defaults to `visible`.
   */
  get overflowX(): "" | "visible" | "scroll" | "clip" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.overflowX);
  }
  set overflowX(value) {
    this.setStringAttribute(SparkleElement.attributes.overflowX, value);
  }

  /**
   * Sets the desired `overflow` behavior for content that does not fit within this element's height.
   *
   * If not provided a value, defaults to `visible`.
   */
  get overflowY(): "" | "visible" | "scroll" | "clip" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.overflowY);
  }
  set overflowY(value) {
    this.setStringAttribute(SparkleElement.attributes.overflowY, value);
  }

  /**
   * Sets the `z-index` of a positioned element and its descendants. Elements with a larger z value appear on top of those with a smaller one.
   */
  get z():
    | ""
    | "0"
    | "1"
    | "drawer"
    | "dialog"
    | "dropdown"
    | "alert"
    | "tooltip"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.z);
  }
  set z(value) {
    this.setStringAttribute(SparkleElement.attributes.z, value);
  }

  /**
   * Sets this element's `width`.
   */
  get width(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.width);
  }
  set width(value) {
    this.setStringAttribute(SparkleElement.attributes.width, value);
  }

  /**
   * Sets the `min-width` of this element. Prevents the element's width from becoming smaller than the value specified.
   */
  get widthMin(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.widthMin);
  }
  set widthMin(value) {
    this.setStringAttribute(SparkleElement.attributes.widthMin, value);
  }

  /**
   * Sets the `max-width` of this element. Prevents the element's width from becoming larger than the value specified.
   */
  get widthMax(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.widthMax);
  }
  set widthMax(value) {
    this.setStringAttribute(SparkleElement.attributes.widthMax, value);
  }

  /**
   * Sets this element's `height`.
   */
  get height(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.height);
  }
  set height(value) {
    this.setStringAttribute(SparkleElement.attributes.height, value);
  }

  /**
   * Sets the `min-height` of this element. Prevents the element's height from becoming smaller than the value specified.
   */
  get heightMin(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.heightMin);
  }
  set heightMin(value) {
    this.setStringAttribute(SparkleElement.attributes.heightMin, value);
  }

  /**
   * Sets the `max-height` of this element. Prevents the element's height from becoming larger than the value specified.
   */
  get heightMax(): "" | "100%" | "min-content" | "max-content" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.heightMax);
  }
  set heightMax(value) {
    this.setStringAttribute(SparkleElement.attributes.heightMax, value);
  }

  /**
   * Rounds the corners of this element by specifying a `border-radius`.
   *
   * @summary c
   */
  get corner(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.corner);
  }
  set corner(value) {
    this.setStringAttribute(SparkleElement.attributes.corner, value);
  }

  /**
   * Rounds the top-left and top-right corners of this element by specifying a `border-top-left-radius` and `border-top-right-radius`.
   *
   * @summary c-t
   */
  get cornerT(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerT);
  }
  set cornerT(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerT, value);
  }

  /**
   * Rounds the top-right and bottom-right corners of this element by specifying a `border-top-right-radius` and `border-bottom-right-radius`.
   *
   * @summary c-r
   */
  get cornerR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerR);
  }
  set cornerR(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerR, value);
  }

  /**
   * Rounds the bottom-left and bottom-right corners of this element by specifying a `border-bottom-left-radius` and `border-bottom-right-radius`.
   *
   * @summary c-b
   */
  get cornerB(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerB);
  }
  set cornerB(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerB, value);
  }

  /**
   * Rounds the top-left and bottom-left corners of this element by specifying a `border-top-left-radius` and `border-bottom-left-radius`.
   *
   * @summary c-l
   */
  get cornerL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerL);
  }
  set cornerL(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerL, value);
  }

  /**
   * Rounds the top-left corner of this element by specifying a `border-top-left-radius`.
   *
   * @summary c-tl
   */
  get cornerTL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerTL);
  }
  set cornerTL(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerTL, value);
  }

  /**
   * Rounds the top-right corner of this element by specifying a `border-top-right-radius`.
   *
   * @summary c-tr
   */
  get cornerTR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerTR);
  }
  set cornerTR(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerTR, value);
  }

  /**
   * Rounds the bottom-right corner of this element by specifying a `border-bottom-right-radius`.
   *
   * @summary c-br
   */
  get cornerBR(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerBR);
  }
  set cornerBR(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerBR, value);
  }

  /**
   * Rounds the bottom-left corner of this element by specifying a `border-bottom-left-radius`.
   *
   * @summary c-bl
   */
  get cornerBL(): "" | SizeName | "full" | "circle" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.cornerBL);
  }
  set cornerBL(value) {
    this.setStringAttribute(SparkleElement.attributes.cornerBL, value);
  }

  /**
   * Sets how far the `top` `right` `bottom` and `left` edges of this element are from the corresponding edges of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i
   */
  get inset(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.inset);
  }
  set inset(value) {
    this.setStringAttribute(SparkleElement.attributes.inset, value);
  }

  /**
   * Sets how far the `top` edge of this element is from the top edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-t
   */
  get insetT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetT);
  }
  set insetT(value) {
    this.setStringAttribute(SparkleElement.attributes.insetT, value);
  }

  /**
   * Sets how far the `right` edge of this element is from the right edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-r
   */
  get insetR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetR);
  }
  set insetR(value) {
    this.setStringAttribute(SparkleElement.attributes.insetR, value);
  }

  /**
   * Sets how far the `bottom` edge of this element is from the bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-b
   */
  get insetB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetB);
  }
  set insetB(value) {
    this.setStringAttribute(SparkleElement.attributes.insetB, value);
  }

  /**
   * Sets how far the `left` edge of this element is from the left edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-l
   */
  get insetL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetL);
  }
  set insetL(value) {
    this.setStringAttribute(SparkleElement.attributes.insetL, value);
  }

  /**
   * Sets how far the `left` and `right` edge of this element is from the left and right edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-lr
   */
  get insetLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetLR);
  }
  set insetLR(value) {
    this.setStringAttribute(SparkleElement.attributes.insetLR, value);
  }

  /**
   * Sets how far the `top` and `bottom` edge of this element is from the top and bottom edge of its closest positioned parent. It has no effect on non-positioned elements.
   *
   * @summary i-tb
   */
  get insetTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.insetTB);
  }
  set insetTB(value) {
    this.setStringAttribute(SparkleElement.attributes.insetTB, value);
  }

  /**
   * Sets the `outline-width` of this element.
   *
   * @summary o-width
   */
  get outlineWidth(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidth);
  }
  set outlineWidth(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidth, value);
  }

  /**
   * Sets the `outline-top-width` of this element.
   *
   * @summary o-width-t
   */
  get outlineWidthT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthT);
  }
  set outlineWidthT(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthT, value);
  }

  /**
   * Sets the `outline-right-width` of this element.
   *
   * @summary o-width-r
   */
  get outlineWidthR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthR);
  }
  set outlineWidthR(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthR, value);
  }

  /**
   * Sets the `outline-bottom-width` of this element.
   *
   * @summary o-width-b
   */
  get outlineWidthB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthB);
  }
  set outlineWidthB(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthB, value);
  }

  /**
   * Sets the `outline-left-width` of this element.
   *
   * @summary o-width-l
   */
  get outlineWidthL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthL);
  }
  set outlineWidthL(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthL, value);
  }

  /**
   * Sets the `outline-left-width` and `outline-right-width` of this element.
   *
   * @summary o-width-lr
   */
  get outlineWidthLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthLR);
  }
  set outlineWidthLR(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthLR, value);
  }

  /**
   * Sets the `outline-top-width` and `outline-bottom-width` of this element.
   *
   * @summary o-width-tb
   */
  get outlineWidthTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineWidthTB);
  }
  set outlineWidthTB(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineWidthTB, value);
  }

  /**
   * Sets the `outline-color` of this element.
   */
  get outlineColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColor);
  }
  set outlineColor(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColor, value);
  }

  /**
   * Sets the `outline-top-color` of this element.
   *
   * @summary o-color-t
   */
  get outlineColorT(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorT);
  }
  set outlineColorT(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorT, value);
  }

  /**
   * Sets the `outline-right-color` of this element.
   *
   * @summary o-color-r
   */
  get outlineColorR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorR);
  }
  set outlineColorR(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorR, value);
  }

  /**
   * Sets the `outline-bottom-color` of this element.
   *
   * @summary o-color-b
   */
  get outlineColorB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorB);
  }
  set outlineColorB(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorB, value);
  }

  /**
   * Sets the `outline-left-color` of this element.
   *
   * @summary o-color-l
   */
  get outlineColorL(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorL);
  }
  set outlineColorL(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorL, value);
  }

  /**
   * Sets the `outline-top-color` and `outline-bottom-color` of this element.
   *
   * @summary o-color-tb
   */
  get outlineColorTB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorTB);
  }
  set outlineColorTB(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorTB, value);
  }

  /**
   * Sets the `outline-left-color` and `outline-right-color` of this element.
   *
   * @summary o-color-lr
   */
  get outlineColorLR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.outlineColorLR);
  }
  set outlineColorLR(value) {
    this.setStringAttribute(SparkleElement.attributes.outlineColorLR, value);
  }

  /**
   * Sets the `border-width` of this element.
   *
   * @summary b-width
   */
  get borderWidth(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidth);
  }
  set borderWidth(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidth, value);
  }

  /**
   * Sets the `border-top-width` of this element.
   *
   * @summary b-width-t
   */
  get borderWidthT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthT);
  }
  set borderWidthT(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthT, value);
  }

  /**
   * Sets the `border-right-width` of this element.
   *
   * @summary b-width-r
   */
  get borderWidthR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthR);
  }
  set borderWidthR(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthR, value);
  }

  /**
   * Sets the `border-bottom-width` of this element.
   *
   * @summary b-width-b
   */
  get borderWidthB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthB);
  }
  set borderWidthB(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthB, value);
  }

  /**
   * Sets the `border-left-width` of this element.
   *
   * @summary b-width-l
   */
  get borderWidthL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthL);
  }
  set borderWidthL(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthL, value);
  }

  /**
   * Sets the `border-left-width` and `border-right-width` of this element.
   *
   * @summary b-width-lr
   */
  get borderWidthLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthLR);
  }
  set borderWidthLR(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthLR, value);
  }

  /**
   * Sets the `border-top-width` and `border-bottom-width` of this element.
   *
   * @summary b-width-tb
   */
  get borderWidthTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderWidthTB);
  }
  set borderWidthTB(value) {
    this.setStringAttribute(SparkleElement.attributes.borderWidthTB, value);
  }

  /**
   * Sets the `border-color` of this element.
   */
  get borderColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColor);
  }
  set borderColor(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColor, value);
  }

  /**
   * Sets the `border-top-color` of this element.
   *
   * @summary b-color-t
   */
  get borderColorT(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorT);
  }
  set borderColorT(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorT, value);
  }

  /**
   * Sets the `border-right-color` of this element.
   *
   * @summary b-color-r
   */
  get borderColorR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorR);
  }
  set borderColorR(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorR, value);
  }

  /**
   * Sets the `border-bottom-color` of this element.
   *
   * @summary b-color-b
   */
  get borderColorB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorB);
  }
  set borderColorB(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorB, value);
  }

  /**
   * Sets the `border-left-color` of this element.
   *
   * @summary b-color-l
   */
  get borderColorL(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorL);
  }
  set borderColorL(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorL, value);
  }

  /**
   * Sets the `border-top-color` and `border-bottom-color` of this element.
   *
   * @summary b-color-tb
   */
  get borderColorTB(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorTB);
  }
  set borderColorTB(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorTB, value);
  }

  /**
   * Sets the `border-left-color` and `border-right-color` of this element.
   *
   * @summary b-color-lr
   */
  get borderColorLR(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.borderColorLR);
  }
  set borderColorLR(value) {
    this.setStringAttribute(SparkleElement.attributes.borderColorLR, value);
  }

  /**
   * Sets the `margin` area around this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m
   */
  get margin(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.margin);
  }
  set margin(value) {
    this.setStringAttribute(SparkleElement.attributes.margin, value);
  }

  /**
   * Sets the `margin-top` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-t
   */
  get marginT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginT);
  }
  set marginT(value) {
    this.setStringAttribute(SparkleElement.attributes.marginT, value);
  }

  /**
   * Sets the `margin-right` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-r
   */
  get marginR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginR);
  }
  set marginR(value) {
    this.setStringAttribute(SparkleElement.attributes.marginR, value);
  }

  /**
   * Sets the `margin-bottom` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-b
   */
  get marginB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginB);
  }
  set marginB(value) {
    this.setStringAttribute(SparkleElement.attributes.marginB, value);
  }

  /**
   * Sets the `margin-left` area of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-l
   */
  get marginL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginL);
  }
  set marginL(value) {
    this.setStringAttribute(SparkleElement.attributes.marginL, value);
  }

  /**
   * Sets the `margin-left` and `margin-right` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-lr
   */
  get marginLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginLR);
  }
  set marginLR(value) {
    this.setStringAttribute(SparkleElement.attributes.marginLR, value);
  }

  /**
   * Sets the `margin-top` and `margin-bottom` areas of this element.
   *
   * A positive value places it farther from its neighbors, while a negative value places it closer.
   *
   * @summary m-tb
   */
  get marginTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.marginTB);
  }
  set marginTB(value) {
    this.setStringAttribute(SparkleElement.attributes.marginTB, value);
  }

  /**
   * Sets the `padding` area around this element.
   *
   * @summary p
   */
  get padding(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.padding);
  }
  set padding(value) {
    this.setStringAttribute(SparkleElement.attributes.padding, value);
  }

  /**
   * Sets the `padding-top` area of this element.
   *
   * @summary p-t
   */
  get paddingT(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingT);
  }
  set paddingT(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingT, value);
  }

  /**
   * Sets the `padding-right` area of this element.
   *
   * @summary p-r
   */
  get paddingR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingR);
  }
  set paddingR(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingR, value);
  }

  /**
   * Sets the `padding-bottom` area of this element.
   *
   * @summary p-b
   */
  get paddingB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingB);
  }
  set paddingB(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingB, value);
  }

  /**
   * Sets the `padding-left` area of this element.
   *
   * @summary p-l
   */
  get paddingL(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingL);
  }
  set paddingL(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingL, value);
  }

  /**
   * Sets the `padding-left` and `padding-right` areas of this element.
   *
   * @summary p-lr
   */
  get paddingLR(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingLR);
  }
  set paddingLR(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingLR, value);
  }

  /**
   * Sets the `padding-top` and `padding-bottom` areas of this element.
   *
   * @summary p-tb
   */
  get paddingTB(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.paddingTB);
  }
  set paddingTB(value) {
    this.setStringAttribute(SparkleElement.attributes.paddingTB, value);
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
    return this.getStringAttribute(SparkleElement.attributes.childLayout);
  }
  set childLayout(value) {
    this.setStringAttribute(SparkleElement.attributes.childLayout, value);
  }

  /**
   * Sets the `gap` between children.
   */
  get childGap(): "" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.childGap);
  }
  set childGap(value) {
    this.setStringAttribute(SparkleElement.attributes.childGap, value);
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
    return this.getStringAttribute(SparkleElement.attributes.childAlign);
  }
  set childAlign(value) {
    this.setStringAttribute(SparkleElement.attributes.childAlign, value);
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
    return this.getStringAttribute(SparkleElement.attributes.childJustify);
  }
  set childJustify(value) {
    this.setStringAttribute(SparkleElement.attributes.childJustify, value);
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
    return this.getStringAttribute(SparkleElement.attributes.childOverflow);
  }
  set childOverflow(value) {
    this.setStringAttribute(SparkleElement.attributes.childOverflow, value);
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
    return this.getStringAttribute(SparkleElement.attributes.selfAlign);
  }
  set selfAlign(value) {
    this.setStringAttribute(SparkleElement.attributes.selfAlign, value);
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
    return this.getStringAttribute(SparkleElement.attributes.grow);
  }
  set grow(value) {
    this.setStringAttribute(SparkleElement.attributes.grow, value);
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
    return this.getStringAttribute(SparkleElement.attributes.shrink);
  }
  set shrink(value) {
    this.setStringAttribute(SparkleElement.attributes.shrink, value);
  }

  /**
   * Sets the `color` of content rendered inside this element.
   */
  get color(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.color);
  }
  set color(value) {
    this.setStringAttribute(SparkleElement.attributes.color, value);
  }

  /**
   * Specifies which `font-family` this element will use to render text.
   */
  get textFont(): "" | "sans" | "serif" | "mono" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textFont);
  }
  set textFont(value) {
    this.setStringAttribute(SparkleElement.attributes.textFont, value);
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
    return this.getStringAttribute(SparkleElement.attributes.textSize);
  }
  set textSize(value) {
    this.setStringAttribute(SparkleElement.attributes.textSize, value);
  }

  /**
   * Sets the `line-height` of all text inside this element.
   *
   * This is commonly used to increase or decrease the distance between lines of text.
   */
  get textLeading(): "" | "none" | SizeName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textLeading);
  }
  set textLeading(value) {
    this.setStringAttribute(SparkleElement.attributes.textLeading, value);
  }

  /**
   * Sets the `letter-spacing` of all text inside this element.
   *
   * This value is added to the font's natural letter spacing.
   * Positive values cause letters to spread farther apart, while negative values bring letters closer together.
   */
  get textKerning(): "" | "none" | SizeName | "2xl" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textKerning);
  }
  set textKerning(value) {
    this.setStringAttribute(SparkleElement.attributes.textKerning, value);
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
    return this.getStringAttribute(SparkleElement.attributes.textWeight);
  }
  set textWeight(value) {
    this.setStringAttribute(SparkleElement.attributes.textWeight, value);
  }

  /**
   * Sets the `text-style` of all text inside this element so that the text is italic.
   */
  get textItalic(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textItalic);
  }
  set textItalic(value) {
    this.setStringAttribute(SparkleElement.attributes.textItalic, value);
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders underneath the text.
   */
  get textUnderline(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textUnderline);
  }
  set textUnderline(value) {
    this.setStringAttribute(SparkleElement.attributes.textUnderline, value);
  }

  /**
   * Sets the `text-decoration` of all text inside this element so that a line renders through the middle of the text.
   */
  get textStrikethrough(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textStrikethrough);
  }
  set textStrikethrough(value) {
    this.setStringAttribute(SparkleElement.attributes.textStrikethrough, value);
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
    return this.getStringAttribute(SparkleElement.attributes.textCase);
  }
  set textCase(value) {
    this.setStringAttribute(SparkleElement.attributes.textCase, value);
  }

  /**
   * Sets the desired `text-align` behavior of all text inside this element.
   *
   * Aligns text to the center, start, or end, or justifies it to fill the width of this element.
   *
   * If not provided a value, defaults to `center`.
   */
  get textAlign(): "" | "center" | "start" | "end" | "justify" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textAlign);
  }
  set textAlign(value) {
    this.setStringAttribute(SparkleElement.attributes.textAlign, value);
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
    return this.getStringAttribute(SparkleElement.attributes.textOverflow);
  }
  set textOverflow(value) {
    this.setStringAttribute(SparkleElement.attributes.textOverflow, value);
  }

  /**
   * Sets the `color` of text rendered inside this element.
   */
  get textColor(): "" | "wrap" | "nowrap" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textColor);
  }
  set textColor(value) {
    this.setStringAttribute(SparkleElement.attributes.textColor, value);
  }

  /**
   * Uses `text-shadow` to create a colored stroke around the text.
   */
  get textStrokeColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.textStrokeColor);
  }
  set textStrokeColor(value) {
    this.setStringAttribute(SparkleElement.attributes.textStrokeColor, value);
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
    return this.getStringAttribute(SparkleElement.attributes.textStrokeWidth);
  }
  set textStrokeWidth(value) {
    this.setStringAttribute(SparkleElement.attributes.textStrokeWidth, value);
  }

  /**
   * Sets the `text-underline-offset` of all underlined text inside this element.
   */
  get textUnderlineOffset(): "" | SizeName | string | null {
    return this.getStringAttribute(
      SparkleElement.attributes.textUnderlineOffset
    );
  }
  set textUnderlineOffset(value) {
    this.setStringAttribute(
      SparkleElement.attributes.textUnderlineOffset,
      value
    );
  }

  /**
   * Sets the `text-decoration-thickness` of all underline or strikethrough lines.
   */
  get textDecorationThickness(): "" | SizeName | string | null {
    return this.getStringAttribute(
      SparkleElement.attributes.textDecorationThickness
    );
  }
  set textDecorationThickness(value) {
    this.setStringAttribute(
      SparkleElement.attributes.textDecorationThickness,
      value
    );
  }

  /**
   * Sets the `background-color` of this element.
   *
   * @summary bg-color
   */
  get backgroundColor(): "" | ColorName | string | null {
    return this.getStringAttribute(SparkleElement.attributes.backgroundColor);
  }
  set backgroundColor(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundColor, value);
  }

  /**
   * Uses `background-image` to display a color gradient as the background of this element.
   *
   * @summary bg-gradient
   */
  get backgroundGradient(): "" | "gloss" | string | null {
    return this.getStringAttribute(
      SparkleElement.attributes.backgroundGradient
    );
  }
  set backgroundGradient(value) {
    this.setStringAttribute(
      SparkleElement.attributes.backgroundGradient,
      value
    );
  }

  /**
   * Uses `background-image` to display a pattern as the background of this element.
   *
   * @summary bg-pattern
   */
  get backgroundPattern():
    | ""
    | "brick"
    | "bubbles"
    | "chainlink"
    | "chevron"
    | "circles"
    | "crosses"
    | "equals"
    | "flowers"
    | "grid"
    | "herringbone"
    | "memphis"
    | "net"
    | "octagon"
    | "parquet"
    | "scales"
    | "shine"
    | "tile"
    | "wave"
    | "weave"
    | "zigzag"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.backgroundPattern);
  }
  set backgroundPattern(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundPattern, value);
  }

  /**
   * Uses `background-image` to display an image inside this element.
   *
   * @summary bg-image
   */
  get backgroundImage(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.backgroundImage);
  }
  set backgroundImage(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundImage, value);
  }

  /**
   * Sets `background-repeat` to determine if images are repeated in a tiling pattern.
   *
   * If not provided a value, defaults to `repeat`.
   *
   * @summary bg-repeat
   */
  get backgroundRepeat(): "" | "repeat" | "x" | "y" | "none" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.backgroundRepeat);
  }
  set backgroundRepeat(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundRepeat, value);
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
    return this.getStringAttribute(SparkleElement.attributes.backgroundAlign);
  }
  set backgroundAlign(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundAlign, value);
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
    return this.getStringAttribute(SparkleElement.attributes.backgroundFit);
  }
  set backgroundFit(value) {
    this.setStringAttribute(SparkleElement.attributes.backgroundFit, value);
  }

  /**
   * Sets the `mask-image` of this element to change the visual shape of this element.
   * Parts that are inside the mask region are visible, while those outside are clipped.
   *
   * If not provided a value, defaults to `circle`.
   */
  get mask():
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
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.mask);
  }
  set mask(value) {
    this.setStringAttribute(SparkleElement.attributes.mask, value);
  }

  /**
   * Adds a `drop-shadow` `filter` to this element.
   */
  get shadow(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.shadow);
  }
  set shadow(value) {
    this.setStringAttribute(SparkleElement.attributes.shadow, value);
  }

  /**
   * Adds an inner `box-shadow` to this element.
   */
  get shadowInset(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.shadowInset);
  }
  set shadowInset(value) {
    this.setStringAttribute(SparkleElement.attributes.shadowInset, value);
  }

  /**
   * Applies a `backdrop-filter` to this element.
   */
  get filter(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.filter);
  }
  set filter(value) {
    this.setStringAttribute(SparkleElement.attributes.filter, value);
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
    return this.getStringAttribute(SparkleElement.attributes.blend);
  }
  set blend(value) {
    this.setStringAttribute(SparkleElement.attributes.blend, value);
  }

  /**
   * Sets the `opacity` of an element to control how transparent it is,
   * with 0 being fully transparent and 1 being fully opaque.
   */
  get opacity(): "" | "0" | "0.5" | "1" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.opacity);
  }
  set opacity(value) {
    this.setStringAttribute(SparkleElement.attributes.opacity, value);
  }

  /**
   * Sets an element's `transform` to move it along the x-axis.
   */
  get translateX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.translateX);
  }
  set translateX(value) {
    this.setStringAttribute(SparkleElement.attributes.translateX, value);
  }

  /**
   * Sets an element's `transform` to move it along the y-axis.
   */
  get translateY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.translateY);
  }
  set translateY(value) {
    this.setStringAttribute(SparkleElement.attributes.translateY, value);
  }

  /**
   * Sets an element's `transform` to move it along the z-axis.
   */
  get translateZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.translateZ);
  }
  set translateZ(value) {
    this.setStringAttribute(SparkleElement.attributes.translateZ, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the x-axis.
   */
  get rotateX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.rotateX);
  }
  set rotateX(value) {
    this.setStringAttribute(SparkleElement.attributes.rotateX, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the y-axis.
   */
  get rotateY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.rotateY);
  }
  set rotateY(value) {
    this.setStringAttribute(SparkleElement.attributes.rotateY, value);
  }

  /**
   * Sets an element's `transform` to rotate it around the z-axis.
   */
  get rotateZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.rotateZ);
  }
  set rotateZ(value) {
    this.setStringAttribute(SparkleElement.attributes.rotateZ, value);
  }

  /**
   * Sets an element's `transform` to scale it along the x-axis.
   */
  get scaleX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.scaleX);
  }
  set scaleX(value) {
    this.setStringAttribute(SparkleElement.attributes.scaleX, value);
  }

  /**
   * Sets an element's `transform` to scale it along the y-axis.
   */
  get scaleY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.scaleY);
  }
  set scaleY(value) {
    this.setStringAttribute(SparkleElement.attributes.scaleY, value);
  }

  /**
   * Sets an element's `transform` to scale it along the z-axis.
   */
  get scaleZ(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.scaleZ);
  }
  set scaleZ(value) {
    this.setStringAttribute(SparkleElement.attributes.scaleZ, value);
  }

  /**
   * Sets an element's `transform` to skew it along the x-axis.
   */
  get skewX(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.skewX);
  }
  set skewX(value) {
    this.setStringAttribute(SparkleElement.attributes.skewX, value);
  }

  /**
   * Sets an element's `transform` to skew it along the y-axis.
   */
  get skewY(): "" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.skewY);
  }
  set skewY(value) {
    this.setStringAttribute(SparkleElement.attributes.skewY, value);
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
    return this.getStringAttribute(SparkleElement.attributes.pivot);
  }
  set pivot(value) {
    this.setStringAttribute(SparkleElement.attributes.pivot, value);
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
    return this.getStringAttribute(SparkleElement.attributes.delay);
  }
  set delay(value) {
    this.setStringAttribute(SparkleElement.attributes.delay, value);
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
    return this.getStringAttribute(SparkleElement.attributes.duration);
  }
  set duration(value) {
    this.setStringAttribute(SparkleElement.attributes.duration, value);
  }

  /**
   * Specifies the `transition-timing-function` used for property changes.
   */
  get ease():
    | ""
    | "linear"
    | "ease"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "ease-1"
    | "ease-2"
    | "ease-3"
    | "ease-4"
    | "ease-5"
    | "ease-in-1"
    | "ease-in-2"
    | "ease-in-3"
    | "ease-in-4"
    | "ease-in-5"
    | "ease-out-1"
    | "ease-out-2"
    | "ease-out-3"
    | "ease-out-4"
    | "ease-out-5"
    | "ease-in-out-1"
    | "ease-in-out-2"
    | "ease-in-out-3"
    | "ease-in-out-4"
    | "ease-in-out-5"
    | "ease-elastic-1"
    | "ease-elastic-2"
    | "ease-elastic-3"
    | "ease-elastic-4"
    | "ease-elastic-5"
    | "ease-squish-1"
    | "ease-squish-2"
    | "ease-squish-3"
    | "ease-squish-4"
    | "ease-squish-5"
    | "ease-step-1"
    | "ease-step-2"
    | "ease-step-3"
    | "ease-step-4"
    | "ease-step-5"
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.ease);
  }
  set ease(value) {
    this.setStringAttribute(SparkleElement.attributes.ease, value);
  }

  /**
   * Applies an `animation` to this element.
   */
  get animation():
    | ""
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
    | string
    | null {
    return this.getStringAttribute(SparkleElement.attributes.animation);
  }
  set animation(value) {
    this.setStringAttribute(SparkleElement.attributes.animation, value);
  }

  /**
   * Allows keyboard navigation between the children of this element.
   */
  get navigation(): "" | "keyboard" | string | null {
    return this.getStringAttribute(SparkleElement.attributes.navigation);
  }
  set navigation(value) {
    this.setStringAttribute(SparkleElement.attributes.navigation, value);
  }

  get root(): HTMLElement {
    return this.shadowRoot?.firstElementChild as HTMLElement;
  }

  get contentSlot(): HTMLSlotElement | null {
    return this.getElementByClass("content");
  }

  protected _items: HTMLElement[] = [];
  get items(): HTMLElement[] {
    return this._items;
  }

  constructor(init: ShadowRootInit = { mode: "open", delegatesFocus: true }) {
    super();
    const shadowRoot = this.attachShadow(init);
    shadowRoot.innerHTML = this.html;
    shadowRoot.adoptedStyleSheets = [NORMALIZE_CSS];
    const keyframes = Styles.get("keyframes");
    if (keyframes) {
      shadowRoot.adoptedStyleSheets.push(keyframes);
    }
    shadowRoot.adoptedStyleSheets.push(CORE_CSS);
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
    defaultDependencies: Record<string, string>
  ): string {
    if (this.dependencies) {
      Object.entries(defaultDependencies).forEach(
        ([dependencyName, defaultTagName]) => {
          const newTagName = this.dependencies[dependencyName];
          if (newTagName) {
            html.replace(new RegExp(defaultTagName, "g"), newTagName);
          }
        }
      );
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
    const className: string = this.aliases[name] ?? name;
    if (
      className === "role" ||
      className === "tabindex" ||
      className.startsWith("aria-")
    ) {
      // Forward all aria attributes to root element
      this.updateRootAttribute(className, newValue);
    } else {
      const transformer = this.transformers[className];
      if (transformer) {
        this.updateStyleAttribute(className, newValue, transformer);
        if (
          className === SparkleElement.attributes.textStrokeWidth ||
          className === SparkleElement.attributes.textStrokeColor
        ) {
          const width = this.textStrokeWidth || "1";
          this.updateRootCssVariable("text-stroke", getCssTextStroke(width));
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
    if (this.navigation === "keyboard") {
      if (target instanceof HTMLElement) {
        const dir = this.childLayout;
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

  setAssignedToSlot(content: string | Node, name?: string): void {
    const assigned = this.getAssignedToSlot(name);
    assigned.forEach((n) => {
      this.removeChild(n);
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
      this.appendChild(newNode);
    } else {
      const newNode =
        typeof content === "string"
          ? document.createTextNode(content)
          : content;
      this.appendChild(newNode);
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

  getBooleanOrStringAttribute(name: string): string | boolean {
    const value = this.getAttribute(name);
    if (value == null) {
      return false;
    }
    if (value === "") {
      return true;
    }
    return value;
  }
}
