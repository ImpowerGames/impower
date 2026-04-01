import { CSS_ALIASES } from "../../../sparkle-style-transformer/src/constants/CSS_ALIASES";
import { STYLE_ALIASES } from "../../../sparkle-style-transformer/src/constants/STYLE_ALIASES";
import { STYLE_TRANSFORMERS } from "../../../sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS";
import {
  getCssAnimation,
  getCssColor,
  getCssPattern,
} from "../../../sparkle-style-transformer/src/utils/transformers";
import {
  Component,
  ComponentSpec,
  RefMap,
} from "../../../spec-component/src/component";
import { IStore } from "../../../spec-component/src/types/IStore";
import { getAttributeNameMap } from "../../../spec-component/src/utils/getAttributeNameMap";
import { getKeys } from "../../../spec-component/src/utils/getKeys";
import { getPropDefaultsMap } from "../../../spec-component/src/utils/getPropDefaultsMap";
import { getUnitlessValue } from "../../../spec-component/src/utils/getUnitlessValue";
import { ARIA_PROPERTY_NAME_MAP } from "../constants/ARIA_ATTRIBUTES";
import { AnimationName } from "../types/animationName";
import { ColorName } from "../types/colorName";
import { EasingName } from "../types/easingName";
import { LayerName } from "../types/layerName";
import { MaskName } from "../types/maskName";
import { RatioName } from "../types/ratioName";
import { SizeName } from "../types/sizeName";
import { pointerPress, shouldShowStrongFocus } from "../utils/focus";
import { isAssignedToSlot } from "../utils/isAssignedToSlot";
import { updateAttribute } from "../utils/updateAttribute";

export const DEFAULT_SPARKLE_ATTRIBUTES = {
  rtl: "rtl",
  disabled: "disabled",
  rippleColor: "ripple-color",
  enter: "enter",
  exit: "exit",
  ...getAttributeNameMap(getKeys(STYLE_TRANSFORMERS)),
  ...getAttributeNameMap(getKeys(STYLE_ALIASES)),
  ...getAttributeNameMap(getKeys(CSS_ALIASES)),
  ...ARIA_PROPERTY_NAME_MAP,
} as const;

export const DEFAULT_SPARKLE_TRANSFORMERS = {
  ...STYLE_TRANSFORMERS,
  exit: getCssAnimation,
  enter: getCssAnimation,
  "background-pattern": getCssPattern,
  "ripple-color": getCssColor,
};

export const DEFAULT_SPARKLE_PROPS = getPropDefaultsMap(
  DEFAULT_SPARKLE_ATTRIBUTES,
);

const DEFAULT_SPARKLE_ALIAS_ATTRIBUTES = {
  ...STYLE_ALIASES,
  ...CSS_ALIASES,
};

export function SparkleComponent<
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>,
  T extends CustomElementConstructor,
>(
  spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
  transformers: Record<string, (v: string) => string> = {},
  Base: T = HTMLElement as T,
) {
  const augmentedSpec = {
    ...spec,
    props: {
      ...DEFAULT_SPARKLE_PROPS,
      ...(spec.props || {}),
    },
  };
  const cls = class CustomSparkleComponent extends Component<
    typeof DEFAULT_SPARKLE_PROPS,
    Stores,
    Context,
    Graphics,
    Selectors,
    T
  >(augmentedSpec as any, Base) {
    get transformers(): Record<string, (v: string) => string> {
      return { ...DEFAULT_SPARKLE_TRANSFORMERS, ...transformers };
    }

    get aliases(): Record<string, string> {
      return DEFAULT_SPARKLE_ALIAS_ATTRIBUTES;
    }

    /**
     * Whether or not the element should display content right-to-left instead of the usual left-to-right.
     */
    get rtl(): boolean {
      return this.getBooleanAttribute(CustomSparkleComponent.attrs.rtl);
    }
    set rtl(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.rtl, value);
    }

    /**
     * Whether or not the element is disabled.
     */
    get disabled(): boolean {
      return this.getBooleanAttribute(CustomSparkleComponent.attrs.disabled);
    }
    set disabled(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.disabled, value);
    }

    /**
     * Sets the element's `visibility`.
     */
    get visible(): boolean | string {
      return this.getConditionalAttribute(CustomSparkleComponent.attrs.visible);
    }
    set visible(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.visible, value);
    }

    /**
     * Allows this element to capture `pointer-events`.
     */
    get interactable(): boolean | string {
      return this.getConditionalAttribute(
        CustomSparkleComponent.attrs.interactable,
      );
    }
    set interactable(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.interactable, value);
    }

    /**
     * Enables `user-select` so the user can select any text inside this element.
     */
    get selectable(): boolean | string {
      return this.getConditionalAttribute(
        CustomSparkleComponent.attrs.selectable,
      );
    }
    set selectable(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.selectable, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.display);
    }
    set display(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.display, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.position);
    }
    set position(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.position, value);
    }

    /**
     * Sets a preferred `aspect-ratio` for the element.
     */
    get aspect(): "" | RatioName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.aspect);
    }
    set aspect(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.aspect, value);
    }

    /**
     * Sets the desired `overflow` behavior for content that does not fit within this element's width or height.
     *
     * If not provided a value, defaults to `visible`.
     */
    get overflow(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflow);
    }
    set overflow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflow, value);
    }

    /**
     * Sets the desired `overflow` behavior for content that does not fit within this element's width.
     *
     * If not provided a value, defaults to `visible`.
     */
    get overflowX(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflowX);
    }
    set overflowX(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflowX, value);
    }

    /**
     * Sets the desired `overflow` behavior for content that does not fit within this element's height.
     *
     * If not provided a value, defaults to `visible`.
     */
    get overflowY(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflowY);
    }
    set overflowY(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflowY, value);
    }

    /**
     * Sets the `z-index` of a positioned element and its descendants.
     * Elements with a larger z value appear on top of those with a smaller one.
     */
    get z(): "" | "0" | "1" | LayerName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.z);
    }
    set z(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.z, value);
    }

    /**
     * Sets this element's `width`.
     */
    get width(): "" | "100%" | "min-content" | "max-content" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.width);
    }
    set width(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.width, value);
    }

    /**
     * Sets the `min-width` of this element.
     * Prevents the element's width from becoming smaller than the value specified.
     */
    get widthMin():
      | ""
      | "100%"
      | "min-content"
      | "max-content"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.widthMin);
    }
    set widthMin(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.widthMin, value);
    }

    /**
     * Sets the `max-width` of this element.
     * Prevents the element's width from becoming larger than the value specified.
     */
    get widthMax():
      | ""
      | "100%"
      | "min-content"
      | "max-content"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.widthMax);
    }
    set widthMax(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.widthMax, value);
    }

    /**
     * Sets this element's `height`.
     */
    get height(): "" | "100%" | "min-content" | "max-content" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.height);
    }
    set height(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.height, value);
    }

    /**
     * Sets the `min-height` of this element.
     * Prevents the element's height from becoming smaller than the value specified.
     */
    get heightMin():
      | ""
      | "100%"
      | "min-content"
      | "max-content"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.heightMin);
    }
    set heightMin(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.heightMin, value);
    }

    /**
     * Sets the `max-height` of this element.
     * Prevents the element's height from becoming larger than the value specified.
     */
    get heightMax():
      | ""
      | "100%"
      | "min-content"
      | "max-content"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.heightMax);
    }
    set heightMax(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.heightMax, value);
    }

    /**
     * Rounds the corners of this element by specifying a `border-radius`.
     *
     * @summary c
     */
    get corner(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.corner);
    }
    set corner(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.corner, value);
    }

    /**
     * Rounds the top-left corner of this element by specifying a `border-top-left-radius`.
     *
     * @summary c-tl
     */
    get cornerTopLeft(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.cornerTopLeft,
      );
    }
    set cornerTopLeft(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.cornerTopLeft,
        value,
      );
    }

    /**
     * Rounds the top-right corner of this element by specifying a `border-top-right-radius`.
     *
     * @summary c-tr
     */
    get cornerTopRight(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.cornerTopRight,
      );
    }
    set cornerTopRight(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.cornerTopRight,
        value,
      );
    }

    /**
     * Rounds the bottom-right corner of this element by specifying a `border-bottom-right-radius`.
     *
     * @summary c-br
     */
    get cornerBottomRight(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.cornerBottomRight,
      );
    }
    set cornerBottomRight(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.cornerBottomRight,
        value,
      );
    }

    /**
     * Rounds the bottom-left corner of this element by specifying a `border-bottom-left-radius`.
     *
     * @summary c-bl
     */
    get cornerBottomLeft(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.cornerBottomLeft,
      );
    }
    set cornerBottomLeft(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.cornerBottomLeft,
        value,
      );
    }

    /**
     * Sets how far the `top` `right` `bottom` and `left` edges of this element are from the corresponding edges of its closest positioned parent.
     * It has no effect on non-positioned elements.
     *
     * @summary i
     */
    get inset(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.inset);
    }
    set inset(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.inset, value);
    }

    /**
     * Sets how far the `top` edge of this element is from the top edge of its closest positioned parent.
     * It has no effect on non-positioned elements.
     *
     * @summary i-t
     */
    get insetTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.insetTop);
    }
    set insetTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.insetTop, value);
    }

    /**
     * Sets how far the `right` edge of this element is from the right edge of its closest positioned parent.
     * It has no effect on non-positioned elements.
     *
     * @summary i-r
     */
    get insetRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.insetRight);
    }
    set insetRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.insetRight, value);
    }

    /**
     * Sets how far the `bottom` edge of this element is from the bottom edge of its closest positioned parent.
     * It has no effect on non-positioned elements.
     *
     * @summary i-b
     */
    get insetBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.insetBottom);
    }
    set insetBottom(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.insetBottom, value);
    }

    /**
     * Sets how far the `left` edge of this element is from the left edge of its closest positioned parent.
     * It has no effect on non-positioned elements.
     *
     * @summary i-l
     */
    get insetLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.insetLeft);
    }
    set insetLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.insetLeft, value);
    }

    /**
     * Sets the `outline-width` of this element.
     *
     * @summary o-width
     */
    get outlineWidth(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineWidth);
    }
    set outlineWidth(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineWidth, value);
    }

    /**
     * Sets the `outline-color` of this element.
     */
    get outlineColor(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineColor);
    }
    set outlineColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineColor, value);
    }

    /**
     * Sets the `outline-style` of this element.
     *
     * @summary o-style
     */
    get outlineStyle(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineStyle);
    }
    set outlineStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineStyle, value);
    }

    /**
     * Sets the `border-width` of this element.
     *
     * @summary b-width
     */
    get borderWidth(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderWidth);
    }
    set borderWidth(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderWidth, value);
    }

    /**
     * Sets the `border-top-width` of this element.
     *
     * @summary b-width-t
     */
    get borderWidthTop(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderWidthTop,
      );
    }
    set borderWidthTop(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderWidthTop,
        value,
      );
    }

    /**
     * Sets the `border-right-width` of this element.
     *
     * @summary b-width-r
     */
    get borderWidthRight(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderWidthRight,
      );
    }
    set borderWidthRight(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderWidthRight,
        value,
      );
    }

    /**
     * Sets the `border-bottom-width` of this element.
     *
     * @summary b-width-b
     */
    get borderWidthBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderWidthBottom,
      );
    }
    set borderWidthBottom(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderWidthBottom,
        value,
      );
    }

    /**
     * Sets the `border-left-width` of this element.
     *
     * @summary b-width-l
     */
    get borderWidthLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderWidthLeft,
      );
    }
    set borderWidthLeft(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderWidthLeft,
        value,
      );
    }

    /**
     * Sets the `border-color` of this element.
     */
    get borderColor(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderColor);
    }
    set borderColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderColor, value);
    }

    /**
     * Sets the `border-top-color` of this element.
     *
     * @summary b-color-t
     */
    get borderColorTop(): "" | ColorName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderColorTop,
      );
    }
    set borderColorTop(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderColorTop,
        value,
      );
    }

    /**
     * Sets the `border-right-color` of this element.
     *
     * @summary b-color-r
     */
    get borderColorRight(): "" | ColorName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderColorRight,
      );
    }
    set borderColorRight(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderColorRight,
        value,
      );
    }

    /**
     * Sets the `border-bottom-color` of this element.
     *
     * @summary b-color-b
     */
    get borderColorBottom(): "" | ColorName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderColorBottom,
      );
    }
    set borderColorBottom(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderColorBottom,
        value,
      );
    }

    /**
     * Sets the `border-left-color` of this element.
     *
     * @summary b-color-l
     */
    get borderColorLeft(): "" | ColorName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderColorLeft,
      );
    }
    set borderColorLeft(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderColorLeft,
        value,
      );
    }

    /**
     * Sets the `border-style` of this element.
     *
     * @summary b-style
     */
    get borderStyle(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderStyle);
    }
    set borderStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderStyle, value);
    }

    /**
     * Sets the `border-top-style` of this element.
     *
     * @summary b-style-t
     */
    get borderStyleTop(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderStyleTop,
      );
    }
    set borderStyleTop(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderStyleTop,
        value,
      );
    }

    /**
     * Sets the `border-right-style` of this element.
     *
     * @summary b-style-r
     */
    get borderStyleRight(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderStyleRight,
      );
    }
    set borderStyleRight(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderStyleRight,
        value,
      );
    }

    /**
     * Sets the `border-bottom-style` of this element.
     *
     * @summary b-style-b
     */
    get borderStyleBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderStyleBottom,
      );
    }
    set borderStyleBottom(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderStyleBottom,
        value,
      );
    }

    /**
     * Sets the `border-left-style` of this element.
     *
     * @summary b-style-l
     */
    get borderStyleLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.borderStyleLeft,
      );
    }
    set borderStyleLeft(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.borderStyleLeft,
        value,
      );
    }

    /**
     * Sets the `margin` area around this element.
     *
     * A positive value places it farther from its neighbors, while a negative value places it closer.
     *
     * @summary m
     */
    get margin(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.margin);
    }
    set margin(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.margin, value);
    }

    /**
     * Sets the `margin-top` area of this element.
     *
     * A positive value places it farther from its neighbors, while a negative value places it closer.
     *
     * @summary m-t
     */
    get marginTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginTop);
    }
    set marginTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginTop, value);
    }

    /**
     * Sets the `margin-right` area of this element.
     *
     * A positive value places it farther from its neighbors, while a negative value places it closer.
     *
     * @summary m-r
     */
    get marginRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginRight);
    }
    set marginRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginRight, value);
    }

    /**
     * Sets the `margin-bottom` area of this element.
     *
     * A positive value places it farther from its neighbors, while a negative value places it closer.
     *
     * @summary m-b
     */
    get marginBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginBottom);
    }
    set marginBottom(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginBottom, value);
    }

    /**
     * Sets the `margin-left` area of this element.
     *
     * A positive value places it farther from its neighbors, while a negative value places it closer.
     *
     * @summary m-l
     */
    get marginLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginLeft);
    }
    set marginLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginLeft, value);
    }

    /**
     * Sets the `padding` area around this element.
     *
     * @summary p
     */
    get padding(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.padding);
    }
    set padding(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.padding, value);
    }

    /**
     * Sets the `padding-top` area of this element.
     *
     * @summary p-t
     */
    get paddingTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingTop);
    }
    set paddingTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingTop, value);
    }

    /**
     * Sets the `padding-right` area of this element.
     *
     * @summary p-r
     */
    get paddingRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingRight);
    }
    set paddingRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingRight, value);
    }

    /**
     * Sets the `padding-bottom` area of this element.
     *
     * @summary p-b
     */
    get paddingBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.paddingBottom,
      );
    }
    set paddingBottom(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.paddingBottom,
        value,
      );
    }

    /**
     * Sets the `padding-left` area of this element.
     *
     * @summary p-l
     */
    get paddingLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingLeft);
    }
    set paddingLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingLeft, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.childLayout);
    }
    set childLayout(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.childLayout, value);
    }

    /**
     * Sets the `gap` between children.
     */
    get childGap(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.childGap);
    }
    set childGap(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.childGap, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.childAlign);
    }
    set childAlign(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.childAlign, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.childJustify);
    }
    set childJustify(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.childJustify, value);
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.childOverflow,
      );
    }
    set childOverflow(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.childOverflow,
        value,
      );
    }

    /**
     * Uses `align-self` to override the alignment for this element along the cross axis.
     *
     * When layout is `column`, this controls the horizontal alignment.
     * When layout is `row`, this controls the vertical alignment.
     *
     * If not provided a value, defaults to `center`.
     */
    get selfAlign():
      | ""
      | "center"
      | "stretch"
      | "start"
      | "end"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.selfAlign);
    }
    set selfAlign(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.selfAlign, value);
    }

    /**
     * Uses `flex` to control how much the element will flex.
     *
     * If not provided a value, defaults to `1`.
     */
    get flex(): "" | "0" | "1" | "2" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.flex);
    }
    set flex(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.flex, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.grow);
    }
    set grow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.grow, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.shrink);
    }
    set shrink(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shrink, value);
    }

    /**
     * Sets the `color` of content rendered inside this element.
     */
    get color(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.color);
    }
    set color(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.color, value);
    }

    /**
     * Specifies which `font-family` this element will use to render text.
     */
    get textFont(): "" | "sans" | "serif" | "mono" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textFont);
    }
    set textFont(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textFont, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.textSize);
    }
    set textSize(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textSize, value);
    }

    /**
     * Sets the `line-height` of all text inside this element.
     *
     * This is commonly used to increase or decrease the distance between lines of text.
     */
    get textLeading(): "" | "none" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textLeading);
    }
    set textLeading(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textLeading, value);
    }

    /**
     * Sets the `letter-spacing` of all text inside this element.
     *
     * This value is added to the font's natural letter spacing.
     * Positive values cause letters to spread farther apart, while negative values bring letters closer together.
     */
    get textTracking(): "" | "none" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textTracking);
    }
    set textTracking(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textTracking, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.textWeight);
    }
    set textWeight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textWeight, value);
    }

    /**
     * Sets the `font-style` of all text inside this element so that the text is italic.
     */
    get textStyle(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textStyle);
    }
    set textStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textStyle, value);
    }

    /**
     * Sets the `text-decoration-line` of all text inside this element so that a line renders underneath the text.
     */
    get textDecorationLine(): "" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.textDecorationLine,
      );
    }
    set textDecorationLine(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.textDecorationLine,
        value,
      );
    }

    /**
     * Sets the `text-decoration-color` of all text inside this element so that a line renders through the middle of the text.
     */
    get textDecorationColor(): "" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.textDecorationColor,
      );
    }
    set textDecorationColor(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.textDecorationColor,
        value,
      );
    }

    /**
     * Sets the `text-decoration-thickness` of all underline or strikethrough lines.
     */
    get textDecorationThickness(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.textDecorationThickness,
      );
    }
    set textDecorationThickness(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.textDecorationThickness,
        value,
      );
    }

    /**
     * Sets the `text-underline-offset` of all underlined text inside this element.
     */
    get textUnderlineOffset(): "" | SizeName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.textUnderlineOffset,
      );
    }
    set textUnderlineOffset(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.textUnderlineOffset,
        value,
      );
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.textCase);
    }
    set textCase(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textCase, value);
    }

    /**
     * Sets the desired `text-align` behavior of all text inside this element.
     *
     * Aligns text to the center, start, or end, or justifies it to fill the width of this element.
     *
     * If not provided a value, defaults to `center`.
     */
    get textAlign():
      | ""
      | "center"
      | "start"
      | "end"
      | "justify"
      | string
      | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textAlign);
    }
    set textAlign(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textAlign, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.textOverflow);
    }
    set textOverflow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textOverflow, value);
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.textWhitespace,
      );
    }
    set textWhitespace(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.textWhitespace,
        value,
      );
    }

    /**
     * Sets the `color` of text rendered inside this element.
     */
    get textColor(): "" | "wrap" | "nowrap" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textColor);
    }
    set textColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textColor, value);
    }

    /**
     * Uses `text-shadow` to create a colored stroke around the text.
     */
    get textStroke(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textStroke);
    }
    set textStroke(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textStroke, value);
    }

    /**
     * Sets the `background-color` of this element.
     *
     * @summary bg-color
     */
    get backgroundColor(): "" | ColorName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.backgroundColor,
      );
    }
    set backgroundColor(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.backgroundColor,
        value,
      );
    }

    /**
     * Uses `background-image` to display an image inside this element.
     *
     * @summary bg-image
     */
    get backgroundImage(): "" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.backgroundImage,
      );
    }
    set backgroundImage(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.backgroundImage,
        value,
      );
    }

    /**
     * Sets `background-repeat` to determine if images are repeated in a tiling pattern.
     *
     * If not provided a value, defaults to `repeat`.
     *
     * @summary bg-repeat
     */
    get backgroundRepeat(): "" | "repeat" | "x" | "y" | "none" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.backgroundRepeat,
      );
    }
    set backgroundRepeat(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.backgroundRepeat,
        value,
      );
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.backgroundAlign,
      );
    }
    set backgroundAlign(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.backgroundAlign,
        value,
      );
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.backgroundFit,
      );
    }
    set backgroundFit(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.backgroundFit,
        value,
      );
    }

    /**
     * Sets the `mask-image` of this element to change the visual shape of this element.
     * Parts that are inside the mask region are visible, while those outside are clipped.
     *
     * If not provided a value, defaults to `circle`.
     */
    get mask(): "" | MaskName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.mask);
    }
    set mask(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.mask, value);
    }

    /**
     * Adds a `drop-shadow` `filter` to this element.
     */
    get shadow(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.shadow);
    }
    set shadow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shadow, value);
    }

    /**
     * Adds an inner `box-shadow` to this element.
     */
    get shadowInset(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.shadowInset);
    }
    set shadowInset(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shadowInset, value);
    }

    /**
     * Applies a `backdrop-filter` to this element.
     */
    get filter(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.filter);
    }
    set filter(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.filter, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.blend);
    }
    set blend(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.blend, value);
    }

    /**
     * Sets the `opacity` of an element to control how transparent it is,
     * with 0 being fully transparent and 1 being fully opaque.
     */
    get opacity(): "" | "0" | "0.5" | "1" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.opacity);
    }
    set opacity(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.opacity, value);
    }

    /**
     * Sets an element's `rotate` angle.
     */
    get rotate(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.rotate);
    }
    set rotate(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.rotate, value);
    }

    /**
     * Sets an element's `transform` to scale it.
     */
    get scale(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.scale);
    }
    set scale(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.scale, value);
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
      return this.getStringAttribute(CustomSparkleComponent.attrs.pivot);
    }
    set pivot(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.pivot, value);
    }

    /**
     * Specifies the `transition-delay` between property changes and their resulting transition animation.
     */
    get transitionDelay():
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.transitionDelay,
      );
    }
    set transitionDelay(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.transitionDelay,
        value,
      );
    }

    /**
     * Specifies the `transition-duration` of property changes.
     */
    get transitionDuration():
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
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.transitionDuration,
      );
    }
    set transitionDuration(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.transitionDuration,
        value,
      );
    }

    /**
     * Specifies the `transition-timing-function` used for property changes.
     */
    get transitionEasing(): "" | EasingName | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.transitionEasing,
      );
    }
    set transitionEasing(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.transitionEasing,
        value,
      );
    }

    /**
     * Applies an `animation` to this element.
     */
    get animation(): "" | AnimationName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.animation);
    }
    set animation(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.animation, value);
    }

    /**
     * Specifies an exit `animation` for this element.
     */
    get exit(): "" | AnimationName | string | null {
      return (
        this.getStringAttribute(CustomSparkleComponent.attrs.exit) || "exit"
      );
    }
    set exit(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.exit, value);
    }

    /**
     * Specifies an enter `animation` for this element.
     */
    get enter(): "" | AnimationName | string | null {
      return (
        this.getStringAttribute(CustomSparkleComponent.attrs.enter) || "enter"
      );
    }
    set enter(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.enter, value);
    }

    /**
     * Specifies `content-visibility` for this element.
     */
    get contentVisibility(): "" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.contentVisibility,
      );
    }
    set contentVisibility(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.contentVisibility,
        value,
      );
    }

    /**
     * Specifies `contain-intrinsic-size` for this element.
     */
    get containIntrinsicSize(): "" | string | null {
      return this.getStringAttribute(
        CustomSparkleComponent.attrs.containIntrinsicSize,
      );
    }
    set containIntrinsicSize(value) {
      this.setStringAttribute(
        CustomSparkleComponent.attrs.containIntrinsicSize,
        value,
      );
    }

    override attributeChangedCallback(
      name: string,
      oldValue: string,
      newValue: string,
    ) {
      this.propagateAttribute(name, newValue);
      super.attributeChangedCallback(name, oldValue, newValue);
    }

    override connectedCallback() {
      if (this.shadowRoot) {
        this.contentSlot?.addEventListener(
          "slotchange",
          this.handleContentSlotAssigned,
        );
      } else {
        this.handleContentChildrenAssigned(
          Array.from(this.contentSlot?.children || []),
        );
      }
      this.bindFocus(this.root);
      window.requestAnimationFrame(() => {
        this.onParsed();
      });
      super.connectedCallback();
    }

    override disconnectedCallback() {
      if (this.shadowRoot) {
        this.contentSlot?.removeEventListener(
          "slotchange",
          this.handleContentSlotAssigned,
        );
      }
      this.unbindFocus(this.root);
      super.disconnectedCallback();
    }

    override onRender() {
      for (let i = 0; i < this.attributes.length; i++) {
        const attr = this.attributes[i]!;
        this.propagateAttribute(attr.name, attr.value);
      }
    }

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
        }
      }
    }

    showFocusRing = (visible: boolean) => {
      this.updateRootClass("focused", visible);
    };

    onPointerDown = (e: PointerEvent) => {
      pointerPress();
      this.showFocusRing(shouldShowStrongFocus());
    };

    onFocus = () => {
      this.showFocusRing(shouldShowStrongFocus());
    };

    onBlur = () => {
      this.showFocusRing(false);
    };

    onPressed = () => {
      this.updateRootClass("pressed", true);
    };

    onUnpressed = () => {
      this.updateRootClass("pressed", false);
    };

    bindFocus(el: HTMLElement) {
      el.addEventListener("pressed", this.onPressed);
      el.addEventListener("unpressed", this.onUnpressed);
      el.addEventListener("pointerdown", this.onPointerDown);
      el.addEventListener("focus", this.onFocus);
      el.addEventListener("blur", this.onBlur);
    }

    unbindFocus(el: HTMLElement) {
      el.removeEventListener("pressed", this.onPressed);
      el.removeEventListener("unpressed", this.onUnpressed);
      el.removeEventListener("pointerdown", this.onPointerDown);
      el.removeEventListener("focus", this.onFocus);
      el.removeEventListener("blur", this.onBlur);
    }

    onParsed(): void {}

    handleContentSlotAssigned = (e: Event) => {
      const slot = e.currentTarget as HTMLSlotElement;
      this.handleContentChildrenAssigned(slot.assignedElements());
    };

    handleContentChildrenAssigned(children: Element[]) {
      this.onContentAssigned(children);
    }

    onContentAssigned(children: Element[]): void {}

    getAssignedToSlot<T extends ChildNode>(name?: string): T[] {
      if (this.shadowRoot) {
        return Array.from(this.childNodes).filter((n) =>
          isAssignedToSlot(n, name),
        ) as T[];
      }
      if (name) {
        return Array.from(this.self.querySelectorAll(`[name=${name}]`)).flatMap(
          (slot) => Array.from(slot?.childNodes || []) as T[],
        );
      }
      return Array.from(this.contentSlot?.childNodes || []) as T[];
    }

    setAssignedToSlot(
      content: string | Node | Node[],
      name?: string,
      preserve?: (n: ChildNode) => boolean,
    ): Node[] {
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
        } else if (Array.isArray(content)) {
          for (const c of content) {
            newNode.appendChild(c);
          }
        } else {
          newNode.appendChild(content);
        }
        const nodesToAppend = [];
        if (newNode instanceof DocumentFragment) {
          newNode.childNodes.forEach((n) => {
            nodesToAppend.push(n);
          });
        } else {
          nodesToAppend.push(newNode);
        }
        const parent = this.shadowRoot
          ? this
          : this.self.querySelector(`[name=${name}]`);
        if (parent) {
          const appendedNodes = [];
          for (const node of nodesToAppend) {
            appendedNodes.push(parent.appendChild(node));
          }
          return appendedNodes;
        }
      } else {
        const newNode =
          typeof content === "string"
            ? document.createTextNode(content)
            : content;
        const nodesToAppend = [];
        if (newNode instanceof DocumentFragment) {
          newNode.childNodes.forEach((n) => {
            nodesToAppend.push(n);
          });
        } else if (Array.isArray(newNode)) {
          for (const c of newNode) {
            nodesToAppend.push(c);
          }
        } else {
          nodesToAppend.push(newNode);
        }
        const parent = this.shadowRoot ? this : this.contentSlot;
        if (parent) {
          const appendedNodes = [];
          for (const node of nodesToAppend) {
            appendedNodes.push(parent.appendChild(node));
          }
          return appendedNodes;
        }
      }
      return [];
    }

    updateRootCssVariable(name: string, value: string | null) {
      const varName = name.startsWith("--_") ? name : `--_${name}`;
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
      valueFormatter?: (v: string) => string,
    ) {
      const varName = `--_${name}`;
      const formattedValue =
        valueFormatter && newValue != null
          ? valueFormatter(newValue)
          : newValue;
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
      value: T | number | boolean | null,
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
  };

  return cls as typeof cls & {
    new (...args: any[]): Props &
      InstanceType<
        ReturnType<
          typeof Component<Props, Stores, Context, Graphics, Selectors, T>
        >
      > & {
        readonly attrs: Record<
          keyof Props | keyof typeof DEFAULT_SPARKLE_PROPS,
          string
        >;
        readonly refs: RefMap<Selectors>;
        readonly props: Props;
        readonly stores: Stores;
        readonly context: Context;
      };
  };
}
