/*
 * Based on pixijs SVGParser
 * <https://github.com/pixijs/pixijs/blob/dev/src/scene/graphics/shared/svg/SVGParser.ts>
 *
 * Copyright (c) 2013-2023 Mathew Groves, Chad Engler
 * Released under the MIT license.
 */

import {
  FillGradient,
  FillStyle,
  GraphicsContext,
  GraphicsPath,
  parseSVGDefinitions,
  parseSVGFloatAttribute,
  parseSVGStyle,
  StrokeStyle,
  warn,
} from "pixi.js";
import { getClosestFractionalIndex } from "../path/utils/getClosestFractionalIndex";
import { getPathCommands } from "../path/utils/getPathCommands";
import { getTweenedPathCommands } from "../path/utils/getTweenedPathCommands";
import { stringifyPath } from "../path/utils/stringifyPath";
import { parseSVGDurAttribute } from "./utils/parseSVGDurAttribute";
import { parseSVGKeySplinesAttribute } from "./utils/parseSVGKeySplinesAttribute";
import { parseSVGKeyTimesAttribute } from "./utils/parseSVGKeyTimesAttribute";
import { parseSVGRepeatCountAttribute } from "./utils/parseSVGRepeatCountAttribute";
import { parseSVGValuesAttribute } from "./utils/parseSVGValuesAttribute";

/** Represents a session for SVG parsing. Contains the current state and resources needed during parsing. */
export interface Session {
  /** The graphics context to render to */
  context: GraphicsContext;
  /** The current path being constructed */
  path: GraphicsPath;
  /** Map of definitions by id */
  defs: Record<string, FillGradient>;
}

export interface AnimatedSVGParserOptions {
  /** The time that animations should be displayed at */
  time?: number;
  /** A fillStyle to apply to all shapes */
  fillStyle?: FillStyle;
  /** A strokeStyle to apply to all shapes */
  strokeStyle?: StrokeStyle & { scale: number };
}

/**
 * Parses an SVG element or string and renders it to a graphics context.
 * Handles both SVG strings and SVG DOM elements as input.
 * @param svg - The SVG content to parse, either as a string or element
 * @param graphicsContext - Optional graphics context to render to
 * @returns The graphics context with the SVG rendered into it
 */
export function AnimatedSVGParser(
  svg: string | SVGElement | SVGSVGElement,
  graphicsContext: GraphicsContext,
  options?: AnimatedSVGParserOptions
): GraphicsContext {
  // Convert string input to SVG element
  if (typeof svg === "string") {
    const div = document.createElement("div");

    div.innerHTML = svg.trim();
    svg = div.querySelector("svg") as SVGElement;
  }

  // Initialize parsing session
  const session: Session = {
    context: graphicsContext,
    defs: {},
    path: new GraphicsPath(),
  };

  // Parse definitions (gradients, etc) first
  parseSVGDefinitions(svg, session);

  // Process all child elements except defs
  const children = svg.children;

  const { fillStyle, strokeStyle } = parseSVGStyle(svg, session);

  for (let i = 0; i < children.length; i++) {
    const child = children[i] as SVGElement;

    if (child.nodeName.toLowerCase() === "defs") continue;
    renderChildren(child, session, fillStyle, strokeStyle, options);
  }

  return graphicsContext;
}

/**
 * Recursively renders SVG elements and their children.
 * Handles styling inheritance and different SVG shape types.
 * @param svg - The SVG element to render
 * @param session - The current parsing session
 * @param fillStyle - The inherited fill style
 * @param strokeStyle - The inherited stroke style
 */
function renderChildren(
  svg: SVGElement,
  session: Session,
  fillStyle: FillStyle,
  strokeStyle: StrokeStyle,
  options?: AnimatedSVGParserOptions
): void {
  const children = svg.children;

  // Parse element's style and merge with inherited styles
  const { fillStyle: f1, strokeStyle: s1 } = parseSVGStyle(svg, session);

  if (f1 && fillStyle) {
    fillStyle = { ...fillStyle, ...f1 };
  } else if (f1) {
    fillStyle = f1;
  }
  if (fillStyle && fillStyle?.color == null) {
    fillStyle.color = 0;
  }

  if (s1 && strokeStyle) {
    strokeStyle = { ...strokeStyle, ...s1 };
  } else if (s1) {
    strokeStyle = s1;
  }

  if (options?.fillStyle != null) {
    strokeStyle = { ...fillStyle, ...options.fillStyle };
  }

  if (options?.strokeStyle != null) {
    strokeStyle = { ...strokeStyle, ...options.strokeStyle };
  }

  const scaledStrokeStyle = {
    ...strokeStyle,
    width: (strokeStyle.width ?? 0) * (options?.strokeStyle?.scale ?? 1),
  };

  // Default to black fill if no filStyle specified
  if (!fillStyle) {
    fillStyle = { color: 0 };
  }

  // Variables for shape attributes
  let x;
  let y;
  let x1;
  let y1;
  let x2;
  let y2;
  let cx;
  let cy;
  let r;
  let rx;
  let ry;
  let points;
  let pointsString;
  let d;
  let graphicsPath;
  let width;
  let height;

  // Handle different SVG element types
  switch (svg.nodeName.toLowerCase()) {
    case "animate":
      const attributeName = svg.getAttribute("attributeName");
      if (attributeName === "d") {
        const duration = parseSVGDurAttribute(svg);
        const repeatCount = parseSVGRepeatCountAttribute(svg);
        const keyTimes = parseSVGKeyTimesAttribute(svg);
        const keySplines = parseSVGKeySplinesAttribute(svg);
        const values = parseSVGValuesAttribute(svg);
        if (duration > 0) {
          const time = options?.time ?? 0;
          const currentIteration = Math.floor(time / duration);
          const keyTime = time / duration;
          const fractionalFrameIndex =
            currentIteration > repeatCount
              ? keyTimes.length
              : getClosestFractionalIndex(keyTime, keyTimes);
          const tweenedCommands = getTweenedPathCommands(
            fractionalFrameIndex,
            keySplines,
            values.map((d) => getPathCommands(d))
          );
          const tweenedInstructions = stringifyPath(tweenedCommands);
          graphicsPath = new GraphicsPath(tweenedInstructions, true);
        } else {
          graphicsPath = new GraphicsPath(values[0], true);
        }
        session.context.path(graphicsPath);
        if (fillStyle) session.context.fill(fillStyle);
        if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      } else {
        // #if _DEBUG
        warn(
          `Animating ${attributeName} is not supported, your svg may render incorrectly`
        );
        // #endif
      }
      break;

    case "path":
      d = svg.getAttribute("d") as string;
      if (d != null) {
        if ((svg.getAttribute("fill-rule") as string) === "evenodd") {
          // #if _DEBUG
          warn(
            "SVG Evenodd fill rule not supported, your svg may render incorrectly"
          );
          // #endif
        }

        graphicsPath = new GraphicsPath(d, true);
        session.context.path(graphicsPath);
        if (fillStyle) session.context.fill(fillStyle);
        if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      }
      break;

    case "circle":
      cx = parseSVGFloatAttribute(svg, "cx", 0);
      cy = parseSVGFloatAttribute(svg, "cy", 0);
      r = parseSVGFloatAttribute(svg, "r", 0);
      session.context.ellipse(cx, cy, r, r);
      if (fillStyle) session.context.fill(fillStyle);
      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    case "rect":
      x = parseSVGFloatAttribute(svg, "x", 0);
      y = parseSVGFloatAttribute(svg, "y", 0);
      width = parseSVGFloatAttribute(svg, "width", 0);
      height = parseSVGFloatAttribute(svg, "height", 0);
      rx = parseSVGFloatAttribute(svg, "rx", 0);
      ry = parseSVGFloatAttribute(svg, "ry", 0);

      if (rx || ry) {
        session.context.roundRect(x, y, width, height, rx || ry);
      } else {
        session.context.rect(x, y, width, height);
      }

      if (fillStyle) session.context.fill(fillStyle);
      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    case "ellipse":
      cx = parseSVGFloatAttribute(svg, "cx", 0);
      cy = parseSVGFloatAttribute(svg, "cy", 0);
      rx = parseSVGFloatAttribute(svg, "rx", 0);
      ry = parseSVGFloatAttribute(svg, "ry", 0);

      session.context.beginPath();
      session.context.ellipse(cx, cy, rx, ry);

      if (fillStyle) session.context.fill(fillStyle);
      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    case "line":
      x1 = parseSVGFloatAttribute(svg, "x1", 0);
      y1 = parseSVGFloatAttribute(svg, "y1", 0);
      x2 = parseSVGFloatAttribute(svg, "x2", 0);
      y2 = parseSVGFloatAttribute(svg, "y2", 0);

      session.context.beginPath();
      session.context.moveTo(x1, y1);
      session.context.lineTo(x2, y2);

      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    case "polygon":
      pointsString = svg.getAttribute("points") as string;
      points = pointsString.match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];
      session.context.poly(points, true);
      if (fillStyle) session.context.fill(fillStyle);
      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    case "polyline":
      pointsString = svg.getAttribute("points") as string;
      points = pointsString.match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];
      session.context.poly(points, false);
      if (strokeStyle) session.context.stroke(scaledStrokeStyle);
      break;

    // Group elements - just process children
    case "g":
    case "svg":
      break;

    default: {
      // Log unsupported elements
      warn(`[SVG parser] <${svg.nodeName}> elements unsupported`);
      break;
    }
  }

  // Recursively process child elements
  for (let i = 0; i < children.length; i++) {
    renderChildren(
      children[i] as SVGElement,
      session,
      fillStyle,
      strokeStyle,
      options
    );
  }
}
