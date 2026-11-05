import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import cutoutSvg from "./source/spark_engine_logo_cutout.svg?raw";
import wordmarkSvg from "./source/spark_engine_wordmark.svg?raw";

const sourceArt = (svg: string, name: string) => {
  const viewBox = svg.match(/<svg[^>]* viewBox="([^"]+)"/)?.[1];
  const body = svg.match(/<\/title>([\s\S]*)<\/svg>/)?.[1];
  if (!viewBox || !body) {
    throw new Error(`${name} has no viewBox or no drawing after its title`);
  }
  return { viewBox, body: body.trim() };
};

const cutout = sourceArt(cutoutSvg, "spark_engine_logo_cutout.svg");
const wordmark = sourceArt(wordmarkSvg, "spark_engine_wordmark.svg");

const MARK_VIEWBOX = "180 104 648 792";
const MARK_BODY = cutout.body.replace(/ fill="#[0-9a-fA-F]{3,8}"/g, ' fill="currentColor"');
const WORDMARK_BODY = wordmark.body.replace(/ stroke="#[0-9a-fA-F]{3,8}"/g, ' stroke="currentColor"');

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
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK_BODY }}
    />
  );
}

function Wordmark() {
  return (
    <svg
      data-logo-part="wordmark"
      class="h-full w-auto flex-none text-ink"
      viewBox={wordmark.viewBox}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: WORDMARK_BODY }}
    />
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

export default SparkLogo;
