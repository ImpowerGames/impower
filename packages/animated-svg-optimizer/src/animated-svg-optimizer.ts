import { DOMParser, Element, XMLSerializer } from "@xmldom/xmldom";
import { SVGPathData, SVGPathDataTransformer } from "svg-pathdata";
import { optimize, type Config } from "svgo";

const roundPathDNumbers = (d: string, decimals = 1): string => {
  return d.replace(/-?\d*\.?\d+(e[-+]?\d+)?/gi, (num) =>
    parseFloat(num)
      .toFixed(decimals)
      .replace(/\.?0+$/, "")
  );
};

function parseTransformMatrix(
  transform: string
): [number, number, number, number, number, number] | null {
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return null;

  const parts = match[1]?.split(/[ ,]+/).map(Number) || [];
  if (parts.length !== 6 || parts.some(isNaN)) return null;

  return parts as [number, number, number, number, number, number];
}

function transformPathDWithMatrix(
  d: string,
  matrix: [number, number, number, number, number, number],
  decimals = 1
): string {
  const [a, b, c, d_, e, f] = matrix;

  const transformed = new SVGPathData(d)
    .toAbs() // ensure all commands are absolute
    .transform(SVGPathDataTransformer.MATRIX(a, b, c, d_, e, f))
    .round(decimals)
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

function applyTransformToStroke(
  path: Element,
  matrix: [number, number, number, number, number, number]
) {
  const scale = getStrokeScale(matrix);

  // Scale stroke-width
  const strokeWidth = path.getAttribute("stroke-width");
  if (strokeWidth) {
    const scaled = parseFloat(strokeWidth) * scale;
    path.setAttribute("stroke-width", scaled.toFixed(3).replace(/\.?0+$/, ""));
  }

  // Scale stroke-dasharray
  const dashArray = path.getAttribute("stroke-dasharray");
  if (dashArray) {
    const scaled = dashArray
      .split(/[ ,]+/)
      .map((n) => (parseFloat(n) * scale).toFixed(3).replace(/\.?0+$/, ""))
      .join(" ");
    path.setAttribute("stroke-dasharray", scaled);
  }

  // Optionally scale stroke-dashoffset
  const dashOffset = path.getAttribute("stroke-dashoffset");
  if (dashOffset) {
    const scaled = parseFloat(dashOffset) * scale;
    path.setAttribute(
      "stroke-dashoffset",
      scaled.toFixed(3).replace(/\.?0+$/, "")
    );
  }
}

export const optimizeAnimatedSVG = (
  inputSVG: string,
  userSvgoOptions: Config = { multipass: true }
) => {
  const userPresetDefault = (userSvgoOptions.plugins ?? []).find(
    (p) => typeof p === "object" && p.name === "preset-default"
  ) as {
    name: string;
    params?: {
      floatPrecision: number;
      overrides: {
        convertPathData: {};
      };
    };
  };
  const precision = userPresetDefault?.params?.floatPrecision ?? 1;

  const dom = new DOMParser().parseFromString(inputSVG, "image/svg+xml");
  const serializer = new XMLSerializer();

  const inputPaths = Array.from(dom.getElementsByTagName("path"));
  const animateInfos: {
    path: Element;
    animate: Element;
    keyframes: string[];
  }[] = [];

  for (const path of inputPaths) {
    const animates = Array.from(path.getElementsByTagName("animate"));
    for (const animate of animates) {
      const attrName = animate.getAttribute("attributeName");
      const values = animate.getAttribute("values");
      if (attrName === "d" && values) {
        const keyframes = values.split(";").map((s) => s.trim());

        animateInfos.push({ path, animate, keyframes });
      }
    }
  }

  if (animateInfos.length === 0) {
    return;
  }

  const frameCount = Math.max(
    ...animateInfos.map((info) => info.keyframes.length)
  );
  const optimizedFrames: string[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const clone = new DOMParser().parseFromString(inputSVG, "image/svg+xml");
    const clonedPaths = Array.from(clone.getElementsByTagName("path"));

    animateInfos.forEach(({ keyframes }, pathIndex) => {
      const clonedPath = clonedPaths[pathIndex]!;
      const frameValue =
        keyframes[frameIndex] ?? keyframes[keyframes.length - 1]!;

      clonedPath.setAttribute("d", frameValue);

      // Remove all <animate> elements from this path
      const animates = Array.from(clonedPath.getElementsByTagName("animate"));
      animates.forEach((a) => clonedPath.removeChild(a));
    });

    const serialized = serializer.serializeToString(clone);

    // Always disable mergePaths
    const mergedSvgoOptions: Config = {
      ...userSvgoOptions,
      plugins: [
        {
          name: "preset-default",
          params: {
            ...(typeof userPresetDefault === "string"
              ? {}
              : userPresetDefault?.params ?? {}),
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
        ...(userSvgoOptions.plugins ?? []).filter(
          (p) =>
            typeof p === "string" ||
            (typeof p === "object" && p.name !== "preset-default")
        ),
      ],
    };

    const optimized = optimize(serialized, mergedSvgoOptions).data;
    optimizedFrames.push(optimized);
  }

  // Reattach <animate> elements to the first optimized frame
  const base = new DOMParser().parseFromString(
    optimizedFrames[0]!,
    "image/svg+xml"
  );
  const outputPaths = Array.from(base.getElementsByTagName("path"));

  console.log(
    `Optimizing ${inputPaths.length} input paths into ${outputPaths.length} output paths...`
  );

  animateInfos.forEach(({ animate, keyframes }, pathIndex) => {
    const imported = base.importNode(animate, true);
    const path = outputPaths[pathIndex];
    if (path) {
      const transformAttr = path.getAttribute("transform");
      const matrix = transformAttr ? parseTransformMatrix(transformAttr) : null;
      const transformedKeyframes = keyframes.map((frame) => {
        const transformed = matrix
          ? transformPathDWithMatrix(frame, matrix, precision)
          : roundPathDNumbers(frame, precision);
        return transformed;
      });
      path.removeAttribute("d");
      path.removeAttribute("fill-rule");
      path.removeAttribute("transform");
      if (matrix) {
        applyTransformToStroke(path, matrix);
      }
      path.appendChild(imported);
      imported.setAttribute("values", transformedKeyframes.join(";"));
    }
  });

  const finalOutput = serializer.serializeToString(base);
  return finalOutput;
};
