import { default_metadata } from "./constructors/default_metadata";
import { default_world } from "./constructors/default_world";

export const coreBuiltinDefinitions = () => ({
  metadata: {
    $default: default_metadata(),
  } as Record<string, ReturnType<typeof default_metadata>>,
  world: {
    $default: default_world(),
  } as Record<string, ReturnType<typeof default_world>>,
});

export interface CoreBuiltins extends ReturnType<
  typeof coreBuiltinDefinitions
> {}
