import { DOMParser, Element, XMLSerializer } from "@xmldom/xmldom";
import { SVGPathData, SVGPathDataTransformer } from "svg-pathdata";
import { optimize, type Config } from "svgo";
import {
  compose,
  fromDefinition,
  fromTransformAttribute,
} from "transformation-matrix";

function getPrecisionFromOptions(precisionOrOptions: number | Config = 1) {
  const userPresetDefault =
    typeof precisionOrOptions === "number"
      ? undefined
      : ((precisionOrOptions.plugins ?? []).find(
          (p) => typeof p === "object" && p.name === "preset-default"
        ) as {
          name: string;
          params?: {
            floatPrecision: number;
            overrides: {
              convertPathData: {};
            };
          };
        });
  const precision =
    typeof precisionOrOptions === "number"
      ? precisionOrOptions
      : userPresetDefault?.params?.floatPrecision ?? 1;
  return precision;
}

function normalizeTransformString(transform: string): string {
  // Add space between transform functions if not already present
  return transform.replace(/([)])(?=[a-zA-Z])/g, "$1 ");
}

function parseTransformToMatrix(
  transform: string
): [number, number, number, number, number, number] | null {
  const normalizedTransform = normalizeTransformString(transform);
  try {
    const { a, b, c, d, e, f } = compose(
      fromDefinition(fromTransformAttribute(normalizedTransform))
    );
    return [a, b, c, d, e, f];
  } catch (err) {
    console.warn(`Failed to parse transform: ${normalizedTransform}`, err);
    return null;
  }
}

const roundPathDNumbers = (d: string, decimals = 1): string => {
  return d.replace(/-?\d*\.?\d+(e[-+]?\d+)?/gi, (num) =>
    parseFloat(num)
      .toFixed(decimals)
      .replace(/\.?0+$/, "")
  );
};

function applyTransformMatrixToPath(
  d: string,
  matrix: [number, number, number, number, number, number],
  decimals = 1
): string {
  const [a, b, c, d_, e, f] = matrix;
  const transformed = new SVGPathData(d)
    .toAbs() // ensure all commands are absolute
    .transform(SVGPathDataTransformer.MATRIX(a, b, c, d_, e, f))
    .round(decimals + 1)
    .encode();

  // Round numbers in result
  return transformed;
}

function getStrokeScale(
  matrix: [number, number, number, number, number, number]
): number {
  const [a, b, c, d] = matrix;
  // Approximate using geometric mean of the X and Y scaling factors
  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);
  return Math.sqrt(scaleX * scaleY); // geometric mean
}

function transformStrokeWidth(
  strokeWidth: string,
  matrix: [number, number, number, number, number, number],
  precision: number
) {
  const scale = getStrokeScale(matrix);
  if (strokeWidth) {
    const scaled = parseFloat(strokeWidth) * scale;
    return scaled.toFixed(precision).replace(/\.?0+$/, "");
  }
  return null;
}

function transformStrokeDashArray(
  dashArray: string,
  matrix: [number, number, number, number, number, number],
  precision: number
) {
  const scale = getStrokeScale(matrix);
  if (dashArray) {
    const scaled = dashArray
      .split(/[ ,]+/)
      .map((n) =>
        (parseFloat(n) * scale).toFixed(precision).replace(/\.?0+$/, "")
      )
      .join(" ");
    return scaled;
  }
  return null;
}

function transformStrokeDashOffset(
  dashOffset: string,
  matrix: [number, number, number, number, number, number],
  precision: number
) {
  const scale = getStrokeScale(matrix);
  if (dashOffset) {
    const scaled = parseFloat(dashOffset) * scale;
    return scaled.toFixed(precision).replace(/\.?0+$/, "");
  }
  return null;
}

export const flattenSVG = (inputSVG: string) => {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const inputSVGEl = parser.parseFromString(inputSVG, "image/svg+xml");

  const animateInfos: {
    animate: Element;
    keyframes: string[];
  }[] = [];

  const animates = Array.from(inputSVGEl.getElementsByTagName("animate"));
  for (const animate of animates) {
    const attrName = animate.getAttribute("attributeName");
    const values = animate.getAttribute("values");
    if (attrName === "d" && values) {
      const keyframes = values.split(";").map((s) => s.trim());
      animateInfos.push({ animate, keyframes });
    }
  }

  // Reattach <animate> elements to the first optimized frame
  const outputSVGEl = parser.parseFromString(inputSVG, "image/svg+xml");
  const outputPaths = Array.from(outputSVGEl.getElementsByTagName("path"));

  animateInfos.forEach(({ keyframes }, pathIndex) => {
    const pathEl = outputPaths[pathIndex];
    if (pathEl) {
      const groupEl = outputSVGEl.createElement("g");
      groupEl.setAttribute("class", `animate-${pathIndex}`);
      pathEl.parentElement?.appendChild(groupEl);
      pathEl.parentElement?.removeChild(pathEl);
      keyframes.forEach((keyframe) => {
        const keyframePathEl = outputSVGEl.createElement("path");
        Array.from(pathEl.attributes).forEach((attr) => {
          keyframePathEl.setAttribute(attr.name, attr.value);
        });
        keyframePathEl.setAttribute("d", keyframe);
        groupEl.appendChild(keyframePathEl);
      });
    }
  });

  const outputSVG = serializer.serializeToString(outputSVGEl);
  return outputSVG;
};

export const optimizeSVG = (
  inputSVG: string,
  precisionOrOptions: number | Config = 1
) => {
  const userPresetDefault =
    typeof precisionOrOptions === "number"
      ? undefined
      : ((precisionOrOptions.plugins ?? []).find(
          (p) => typeof p === "object" && p.name === "preset-default"
        ) as {
          name: string;
          params?: {
            floatPrecision: number;
            overrides: {
              convertPathData: {};
            };
          };
        });
  const precision =
    typeof precisionOrOptions === "number"
      ? precisionOrOptions
      : userPresetDefault?.params?.floatPrecision ?? 1;
  const options =
    typeof precisionOrOptions === "number" ? undefined : ({} as Config);

  // Always disable mergePaths since animation requires keeping the same path structure in each frame
  const mergedSvgoOptions: Config = {
    ...(options ?? {}),
    plugins: [
      {
        name: "preset-default",
        params: {
          ...(typeof userPresetDefault === "string"
            ? {}
            : userPresetDefault?.params ?? {}),
          floatPrecision: precision,
          overrides: {
            ...(typeof userPresetDefault === "string"
              ? {}
              : userPresetDefault?.params?.overrides ?? {}),
            mergePaths: false,
            convertShapeToPath: false,
            convertPathData: false,
          },
        },
      },
      ...(options?.plugins ?? []).filter(
        (p) =>
          typeof p === "string" ||
          (typeof p === "object" && p.name !== "preset-default")
      ),
    ],
  };

  const optimizedSVG = optimize(inputSVG, mergedSvgoOptions).data;
  return optimizedSVG;
};

export const transformSVG = (
  inputSVG: string,
  precisionOrOptions: number | Config = 1
) => {
  const precision = getPrecisionFromOptions(precisionOrOptions);

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const outputSVGEl = parser.parseFromString(inputSVG, "image/svg+xml");

  // Remove any redundant group attributes that were applied to the group's paths
  const outputGroupEls = Array.from(outputSVGEl.getElementsByTagName("g"));
  for (const groupEl of outputGroupEls) {
    // Apply transforms and group attributes to paths
    const groupPathEls = Array.from(groupEl.getElementsByTagName("path"));
    for (const pathEl of groupPathEls) {
      if (pathEl) {
        // Apply transform to path
        const transformAttr = pathEl.getAttribute("transform");
        const matrix = transformAttr
          ? parseTransformToMatrix(transformAttr)
          : null;
        const dAttr = pathEl.getAttribute("d");
        if (dAttr) {
          const transformedPathD = matrix
            ? applyTransformMatrixToPath(dAttr, matrix, precision)
            : roundPathDNumbers(dAttr, precision);
          pathEl.setAttribute("d", transformedPathD);
          pathEl.removeAttribute("transform");
        }
        // Apply group fill to path
        const fill = groupEl.getAttribute("fill");
        if (fill != null) {
          pathEl.setAttribute("fill", fill);
        }
        // Apply group fill-rule to path
        const fillRule = groupEl.getAttribute("fill-rule");
        if (fillRule != null) {
          pathEl.setAttribute("fill-rule", fillRule);
        }
        // Apply group stroke to path
        const stroke = groupEl.getAttribute("stroke");
        if (stroke != null) {
          pathEl.setAttribute("stroke", stroke);
        }
        // Apply group stroke-opacity to path
        const strokeLineOpacity = groupEl.getAttribute("stroke-opacity");
        if (strokeLineOpacity != null) {
          pathEl.setAttribute("stroke-opacity", strokeLineOpacity);
        }
        // Apply group stroke-linecap to path
        const strokeLineCap = groupEl.getAttribute("stroke-linecap");
        if (strokeLineCap != null) {
          pathEl.setAttribute("stroke-linecap", strokeLineCap);
        }
        // Apply group stroke-linejoin to path
        const strokeLineJoin = groupEl.getAttribute("stroke-linejoin");
        if (strokeLineJoin != null) {
          pathEl.setAttribute("stroke-linejoin", strokeLineJoin);
        }
        // Apply group stroke-width to path
        const strokeWidth = groupEl.getAttribute("stroke-width");
        if (strokeWidth != null) {
          const transformedStrokeWidth = matrix
            ? transformStrokeWidth(strokeWidth, matrix, precision)
            : strokeWidth;
          if (transformedStrokeWidth != null) {
            pathEl.setAttribute("stroke-width", transformedStrokeWidth);
          }
        }
        // Apply group stroke-dasharray to path
        const strokeDashArray = groupEl.getAttribute("stroke-dasharray");
        if (strokeDashArray != null) {
          const transformedStrokeDashArray = matrix
            ? transformStrokeDashArray(strokeDashArray, matrix, precision)
            : strokeDashArray;
          if (transformedStrokeDashArray != null) {
            pathEl.setAttribute("stroke-dasharray", transformedStrokeDashArray);
          }
        }
        // Apply group stroke-dashoffset to path
        const strokeDashOffset = groupEl.getAttribute("stroke-dashoffset");
        if (strokeDashOffset != null) {
          const transformedStrokeDashOffset = matrix
            ? transformStrokeDashOffset(strokeDashOffset, matrix, precision)
            : strokeDashOffset;
          if (transformedStrokeDashOffset != null) {
            pathEl.setAttribute(
              "stroke-dashoffset",
              transformedStrokeDashOffset
            );
          }
        }
      }
    }

    groupEl.removeAttribute("fill");
    groupEl.removeAttribute("fill-rule");
    groupEl.removeAttribute("stroke");
    groupEl.removeAttribute("stroke-opacity");
    groupEl.removeAttribute("stroke-linecap");
    groupEl.removeAttribute("stroke-linejoin");
    groupEl.removeAttribute("stroke-width");
    groupEl.removeAttribute("stroke-dasharray");
    groupEl.removeAttribute("stroke-dashoffset");
  }

  const outputSVG = serializer.serializeToString(outputSVGEl);
  return outputSVG;
};

export const optimizeFlattenedSVG = (
  inputSVG: string,
  precisionOrOptions: number | Config = 1
) => {
  const flattenedSVG = flattenSVG(inputSVG);
  const optimizedSVG = optimizeSVG(flattenedSVG, precisionOrOptions);
  const transformedSVG = transformSVG(optimizedSVG, precisionOrOptions);
  return transformedSVG;
};

export const optimizeAnimatedSVG = (
  inputSVG: string,
  precisionOrOptions: number | Config = 1,
  removePathAttributes: string[] = []
) => {
  const flattenedSVG = flattenSVG(inputSVG);
  const optimizedSVG = optimizeSVG(flattenedSVG, precisionOrOptions);
  const transformedSVG = transformSVG(optimizedSVG, precisionOrOptions);

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const outputSVGEl = parser.parseFromString(transformedSVG, "image/svg+xml");

  const inputSVGEl = parser.parseFromString(inputSVG, "image/svg+xml");

  const animateEls: Element[] = Array.from(
    inputSVGEl.getElementsByTagName("animate")
  );

  const groupEls = Array.from(outputSVGEl.getElementsByTagName("g"));
  groupEls.forEach((group, groupIndex) => {
    const animateEl = animateEls[groupIndex];
    if (!animateEl) {
      return;
    }
    const clonedAnimateEl = outputSVGEl.importNode(animateEl, true);
    const groupPathEls = Array.from(group.getElementsByTagName("path"));
    const keyframes = groupPathEls
      .map((groupPathEl) => groupPathEl.getAttribute("d"))
      .join(";");
    const firstPathEl = groupPathEls[0];
    if (!firstPathEl) {
      return;
    }
    const clonedFirstPathEl = outputSVGEl.importNode(firstPathEl, true);
    group.parentElement?.replaceChild(clonedFirstPathEl, group);
    if (clonedFirstPathEl) {
      clonedFirstPathEl.appendChild(clonedAnimateEl);
      clonedAnimateEl.setAttribute("values", keyframes);
      clonedFirstPathEl.removeAttribute("d");
      if (removePathAttributes) {
        removePathAttributes.forEach((attr) => {
          clonedFirstPathEl.removeAttribute(attr);
        });
      }
    }
  });

  const outputSVG = serializer.serializeToString(outputSVGEl);
  return outputSVG;
};
