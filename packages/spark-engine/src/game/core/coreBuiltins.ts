import { _filter } from "./constructors/_filter";

export const coreBuiltins = () => ({
  filter: {
    $default: _filter({
      $name: "$default",
    }),
  } as Record<string, ReturnType<typeof _filter>>,
});

export type CoreBuiltins = ReturnType<typeof coreBuiltins>;
