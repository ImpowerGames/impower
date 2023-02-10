import { Paint } from "@pixi-essentials/svg";
import { LINE_CAP, LINE_JOIN } from "@pixi/graphics";
import color from "tinycolor2";

/**
 * Provides the `Paint` for an `SVGElement`. It will also respond to changes in the attributes of the element
 * (not implemented).
 *
 * @public
 */
export class PaintProvider implements Paint {
  public element: SVGElement;

  public fill: number | string;

  public opacity: number;

  public stroke: number | string;

  public strokeDashArray: number[];

  public strokeDashOffset: number;

  public strokeLineCap: LINE_CAP;

  public strokeLineJoin: LINE_JOIN;

  public strokeMiterLimit: number;

  public strokeWidth: number;

  public dirtyId = 0;

  /**
   * @param element - The element whose paint is to be provided.
   */
  constructor(
    element: SVGElement,
    options?: {
      fillColor?: string | number;
      strokeColor?: string | number;
      strokeWidth?: number;
    }
  ) {
    this.element = element;

    const fillOverride = options?.fillColor;
    const strokeOverride = options?.strokeColor;
    const strokeWidthOverride = options?.strokeWidth;

    const fill = element.getAttribute("fill");
    const opacity = element.getAttribute("opacity");
    const stroke = element.getAttribute("stroke");
    const strokeDashArray = element.getAttribute("stroke-dasharray");
    const strokeDashOffset = element.getAttribute("stroke-dashoffset");
    const strokeLineCap = element.getAttribute("stroke-linecap");
    const strokeLineJoin = element.getAttribute("stroke-linejoin");
    const strokeMiterLimit = element.getAttribute("stroke-miterlimit");
    const strokeWidth = element.getAttribute("stroke-width");

    this.opacity = opacity && parseFloat(opacity);
    this.fill =
      fill !== null
        ? fill === "none"
          ? "none"
          : PaintProvider.parseColor(fill)
        : null;
    if (fillOverride != null) {
      this.fill = PaintProvider.parseColor(fillOverride);
    }
    this.stroke =
      stroke && PaintProvider.parseColor(element.getAttribute("stroke"));
    if (strokeOverride != null) {
      this.stroke = PaintProvider.parseColor(strokeOverride);
    }
    this.strokeWidth = strokeWidth && parseFloat(strokeWidth);
    if (strokeWidthOverride != null) {
      this.strokeWidth = strokeWidthOverride;
    }
    this.strokeDashArray =
      strokeDashArray &&
      strokeDashArray?.split(/[, ]+/g).map((num) => parseFloat(num.trim()));
    this.strokeDashOffset = strokeDashOffset && parseFloat(strokeDashOffset);
    this.strokeLineCap = strokeLineCap as unknown as LINE_CAP;
    this.strokeLineJoin = strokeLineJoin as unknown as LINE_JOIN;
    this.strokeMiterLimit = strokeMiterLimit && parseFloat(strokeMiterLimit);
  }

  /**
   * Parses the color attribute into an RGBA hexadecimal equivalent, if encoded. If the `colorString` is `none` or
   * is a `url(#id)` reference, it is returned as is.
   *
   * @param colorString
   * @see https://github.com/bigtimebuddy/pixi-svg/blob/89e4ab834fa4ef05b64741596516c732eae34daa/src/SVG.js#L106
   */
  public static parseColor(value: string | number): number | string {
    let colorString =
      typeof value === "string" ? value : `#${value.toString(16)}`;
    /* Modifications have been made. */
    /* Copyright (C) Matt Karl. */

    if (!colorString) {
      return 0;
    }
    if (colorString === "none" || colorString.startsWith("url")) {
      return colorString;
    }

    if (colorString[0] === "#") {
      // Remove the hash
      colorString = colorString.substring(1);

      // Convert shortcolors fc9 to ffcc99
      if (colorString.length === 3) {
        colorString = colorString.replace(/([a-f0-9])/gi, "$1$1");
      }

      return parseInt(colorString, 16);
    }

    const { r, g, b } = color(colorString).toRgb();

    return (r << 16) + (g << 8) + b;
  }
}
