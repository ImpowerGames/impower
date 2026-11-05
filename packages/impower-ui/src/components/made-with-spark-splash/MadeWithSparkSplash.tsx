import { cn } from "../../utils/cn";
import splashSvg from "./source/made_with_spark_splash.svg?raw";

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

export default MadeWithSparkSplash;
