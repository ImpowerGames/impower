import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import splashSvg from "./source/made_with_spark_splash.svg?raw";

const SPARKY_PATH =
  "M684,112c12,0 16,8 4,16c-68,44 -116,88 -116,136c0,48 40,68 96,104c96,60 148,144 148,252c0,156 -140,268 -312,268c-176,0 -312,-108 -312,-248c0,-72 36,-136 92,-180c16,-12 28,-8 32,12c8,44 40,68 84,68c44,0 80,-32 80,-76c0,-48 -48,-72 -88,-92c-44,-20 -60,-44 -48,-80c32,-96 188,-184 340,-180ZM401.6,616c-22.077,0 -40,17.923 -40,40l0,72c0,22.077 17.923,40 40,40c22.077,0 40,-17.923 40,-40l0,-72c0,-22.077 -17.923,-40 -40,-40ZM606.4,616c-22.077,0 -40,17.923 -40,40l0,72c0,22.077 17.923,40 40,40c22.077,0 40,-17.923 40,-40l0,-72c0,-22.077 -17.923,-40 -40,-40Z";

const SPARK_STROKES = [
  ["0 0", "M70,-79C64,-87 53,-90 42,-90C24,-90 14,-81 14,-69C14,-57 26,-53 43,-50C60,-47 72,-42 72,-30C72,-17 60,-10 43,-10C30,-10 20,-14 14,-22"],
  ["100 0", "M13,-87V32M53,-90A40,40 0 1 1 53,-10A40,40 0 1 1 53,-90"],
  ["220 0", "M93,-87V-13M53,-90A40,40 0 1 0 53,-10A40,40 0 1 0 53,-90"],
  ["340 0", "M13,-87V-13M13,-50A40,40 0 0 1 66.7,-87.6"],
  ["426 0", "M13,-137V-13M78,-87L15,-40M40,-59L80,-13"],
] as const;

const ENGINE_STROKES = [
  ["0 0", "M72,-92H8V-8H72M8,-50H62"],
  ["154.3 0", "M8,-8V-92L84,-8V-92"],
  ["320.59 0", "M84.4,-74.1A42,42 0 1 0 92,-50H62"],
  ["494.89 0", "M8,-92V-8"],
  ["585.19 0", "M8,-8V-92L84,-8V-92"],
  ["751.48 0", "M72,-92H8V-8H72M8,-50H62"],
] as const;

const strokes = (paths: readonly (readonly [string, string])[], width: number) => (
  <g
    fill="none"
    stroke="currentColor"
    stroke-width={width}
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {paths.map(([offset, d]) => (
      <path key={offset} transform={`translate(${offset})`} d={d} />
    ))}
  </g>
);

export const sparkLogoVariants = cva("inline-flex flex-none items-center", {
  variants: {
    layout: {
      mark: "",
      wordmark: "",
      lockup: "gap-2",
    },
    size: {
      sm: "h-6",
      md: "h-[30px]",
    },
  },
  defaultVariants: {
    layout: "lockup",
    size: "md",
  },
});

export type SparkLogoProps = VariantProps<typeof sparkLogoVariants> & {
  class?: string;
  label?: string;
};

function Mark() {
  return (
    <svg
      data-logo-part="mark"
      class="h-full w-auto flex-none text-accent"
      viewBox="180 104 648 792"
      aria-hidden="true"
    >
      <path d={SPARKY_PATH} fill="currentColor" fill-rule="evenodd" />
    </svg>
  );
}

function Wordmark() {
  return (
    <svg
      data-logo-part="wordmark"
      class="h-full w-auto flex-none text-ink"
      viewBox="-1 -152 522 283.48"
      aria-hidden="true"
    >
      {strokes(SPARK_STROKES, 26)}
      <g transform="translate(2.24 128.24) scale(0.62)">{strokes(ENGINE_STROKES, 20)}</g>
    </svg>
  );
}

export function SparkLogo({ layout, size, class: className, label = "Spark Engine" }: SparkLogoProps) {
  const resolved = layout ?? "lockup";
  return (
    <span role="img" aria-label={label} class={cn(sparkLogoVariants({ layout, size }), className)}>
      {resolved !== "wordmark" && <Mark />}
      {resolved !== "mark" && <Wordmark />}
    </span>
  );
}

export type MadeWithSparkSplashProps = {
  class?: string;
};

export function MadeWithSparkSplash({ class: className }: MadeWithSparkSplashProps) {
  return (
    <div
      role="img"
      aria-label="Made with Spark"
      class={cn("block aspect-video w-full [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: splashSvg.replace(/^<\?xml[^>]*>\s*/, "") }}
    />
  );
}

export default SparkLogo;
