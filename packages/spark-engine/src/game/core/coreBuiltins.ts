import { default_filter } from "./constructors/default_filter";

export const coreBuiltinDefinitions = () => ({
  filter: {
    $default: default_filter(),
  } as Record<string, ReturnType<typeof default_filter>>,
});

export type CoreBuiltins = ReturnType<typeof coreBuiltinDefinitions>;
