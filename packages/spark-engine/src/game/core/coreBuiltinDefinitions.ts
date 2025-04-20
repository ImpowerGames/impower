import { default_filter } from "./constructors/default_filter";
import { default_metadata } from "./constructors/default_metadata";
import { default_world } from "./constructors/default_world";

export const coreBuiltinDefinitions = () => ({
  metadata: {
    $default: default_metadata(),
  } as Record<string, ReturnType<typeof default_metadata>>,
  filter: {
    $default: default_filter(),
  } as Record<string, ReturnType<typeof default_filter>>,
  world: {
    $default: default_world(),
  } as Record<string, ReturnType<typeof default_world>>,
});

export interface CoreBuiltins
  extends ReturnType<typeof coreBuiltinDefinitions> {}
