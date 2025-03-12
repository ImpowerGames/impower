import { default_filter } from "./constructors/default_filter";
import { default_metadata } from "./constructors/default_metadata";

export const coreBuiltinDefinitions = () => ({
  metadata: {
    $default: default_metadata(),
  } as Record<string, ReturnType<typeof default_metadata>>,
  filter: {
    $default: default_filter(),
  } as Record<string, ReturnType<typeof default_filter>>,
});

export interface CoreBuiltins
  extends ReturnType<typeof coreBuiltinDefinitions> {}
