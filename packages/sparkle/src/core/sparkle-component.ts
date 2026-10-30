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
  class CustomSparkleComponent extends Component<
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

    get rtl(): boolean {
      return this.getBooleanAttribute(CustomSparkleComponent.attrs.rtl);
    }
    set rtl(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.rtl, value);
    }

    get disabled(): boolean {
      return this.getBooleanAttribute(CustomSparkleComponent.attrs.disabled);
    }
    set disabled(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.disabled, value);
    }

    get visible(): boolean | string {
      return this.getConditionalAttribute(CustomSparkleComponent.attrs.visible);
    }
    set visible(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.visible, value);
    }

    get interactable(): boolean | string {
      return this.getConditionalAttribute(
        CustomSparkleComponent.attrs.interactable,
      );
    }
    set interactable(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.interactable, value);
    }

    get selectable(): boolean | string {
      return this.getConditionalAttribute(
        CustomSparkleComponent.attrs.selectable,
      );
    }
    set selectable(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.selectable, value);
    }

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

    get aspect(): "" | RatioName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.aspect);
    }
    set aspect(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.aspect, value);
    }

    get overflow(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflow);
    }
    set overflow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflow, value);
    }

    get overflowX(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflowX);
    }
    set overflowX(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflowX, value);
    }

    get overflowY(): "" | "visible" | "scroll" | "clip" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.overflowY);
    }
    set overflowY(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.overflowY, value);
    }

    get z(): "" | "0" | "1" | LayerName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.z);
    }
    set z(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.z, value);
    }

    get width(): "" | "100%" | "min-content" | "max-content" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.width);
    }
    set width(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.width, value);
    }

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

    get height(): "" | "100%" | "min-content" | "max-content" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.height);
    }
    set height(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.height, value);
    }

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

    get corner(): "" | SizeName | "full" | "circle" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.corner);
    }
    set corner(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.corner, value);
    }

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

    get anchor(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.anchor);
    }
    set anchor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.anchor, value);
    }

    get anchorTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.anchorTop);
    }
    set anchorTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.anchorTop, value);
    }

    get anchorRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.anchorRight);
    }
    set anchorRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.anchorRight, value);
    }

    get anchorBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.anchorBottom);
    }
    set anchorBottom(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.anchorBottom, value);
    }

    get anchorLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.anchorLeft);
    }
    set anchorLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.anchorLeft, value);
    }

    get outlineWidth(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineWidth);
    }
    set outlineWidth(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineWidth, value);
    }

    get outlineColor(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineColor);
    }
    set outlineColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineColor, value);
    }

    get outlineStyle(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.outlineStyle);
    }
    set outlineStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.outlineStyle, value);
    }

    get borderWidth(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderWidth);
    }
    set borderWidth(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderWidth, value);
    }

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

    get borderColor(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderColor);
    }
    set borderColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderColor, value);
    }

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

    get borderStyle(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.borderStyle);
    }
    set borderStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.borderStyle, value);
    }

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

    get margin(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.margin);
    }
    set margin(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.margin, value);
    }

    get marginTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginTop);
    }
    set marginTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginTop, value);
    }

    get marginRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginRight);
    }
    set marginRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginRight, value);
    }

    get marginBottom(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginBottom);
    }
    set marginBottom(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginBottom, value);
    }

    get marginLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.marginLeft);
    }
    set marginLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.marginLeft, value);
    }

    get padding(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.padding);
    }
    set padding(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.padding, value);
    }

    get paddingTop(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingTop);
    }
    set paddingTop(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingTop, value);
    }

    get paddingRight(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingRight);
    }
    set paddingRight(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingRight, value);
    }

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

    get paddingLeft(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.paddingLeft);
    }
    set paddingLeft(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.paddingLeft, value);
    }

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

    get childGap(): "" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.childGap);
    }
    set childGap(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.childGap, value);
    }

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

    get flex(): "" | "0" | "1" | "2" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.flex);
    }
    set flex(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.flex, value);
    }

    get grow(): "" | "0" | "1" | "2" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.grow);
    }
    set grow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.grow, value);
    }

    get shrink(): "" | "0" | "1" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.shrink);
    }
    set shrink(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shrink, value);
    }

    get color(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.color);
    }
    set color(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.color, value);
    }

    get textFont(): "" | "sans" | "serif" | "mono" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textFont);
    }
    set textFont(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textFont, value);
    }

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

    get textLeading(): "" | "none" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textLeading);
    }
    set textLeading(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textLeading, value);
    }

    get textTracking(): "" | "none" | SizeName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textTracking);
    }
    set textTracking(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textTracking, value);
    }

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

    get textStyle(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textStyle);
    }
    set textStyle(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textStyle, value);
    }

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

    get textColor(): "" | "wrap" | "nowrap" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textColor);
    }
    set textColor(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textColor, value);
    }

    get textStroke(): "" | ColorName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.textStroke);
    }
    set textStroke(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.textStroke, value);
    }

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

    get mask(): "" | MaskName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.mask);
    }
    set mask(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.mask, value);
    }

    get shadow(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.shadow);
    }
    set shadow(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shadow, value);
    }

    get shadowInset(): "" | "0" | "1" | "2" | "3" | "4" | "5" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.shadowInset);
    }
    set shadowInset(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.shadowInset, value);
    }

    get filter(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.filter);
    }
    set filter(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.filter, value);
    }

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

    get opacity(): "" | "0" | "0.5" | "1" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.opacity);
    }
    set opacity(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.opacity, value);
    }

    get rotate(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.rotate);
    }
    set rotate(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.rotate, value);
    }

    get scale(): "" | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.scale);
    }
    set scale(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.scale, value);
    }

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

    get animation(): "" | AnimationName | string | null {
      return this.getStringAttribute(CustomSparkleComponent.attrs.animation);
    }
    set animation(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.animation, value);
    }

    get exit(): "" | AnimationName | string | null {
      return (
        this.getStringAttribute(CustomSparkleComponent.attrs.exit) || "exit"
      );
    }
    set exit(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.exit, value);
    }

    get enter(): "" | AnimationName | string | null {
      return (
        this.getStringAttribute(CustomSparkleComponent.attrs.enter) || "enter"
      );
    }
    set enter(value) {
      this.setStringAttribute(CustomSparkleComponent.attrs.enter, value);
    }

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

    override afterNodeMorphed(oldNode: Element, newNode: Element) {
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
        if (this.root !== this) {
          this.root.setAttribute(attrName, value);
        }
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

    updateCssVariable(name: string, value: string | null) {
      const varName = name.startsWith("--_") ? name : `--_${name}`;
      this.style.setProperty(varName, value ?? null);
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
        this.updateCssVariable(varName, formattedValue);
      } else {
        this.updateCssVariable(varName, null);
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
      return value != null
        ? (getUnitlessValue(value, emptyValue) ?? null)
        : null;
    }

    setNumberAttribute(name: string, value: number | null): void | null {
      if (value != null) {
        this.setAttribute(name, String(value));
      } else {
        this.removeAttribute(name);
      }
    }
  }

  return CustomSparkleComponent as typeof CustomSparkleComponent & {
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
