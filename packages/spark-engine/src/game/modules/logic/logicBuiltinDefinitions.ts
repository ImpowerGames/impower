import { BlockData } from "./types/BlockData";

export const logicBuiltins = () => ({
  config: {
    logic: {
      blockMap: {} as Record<string, BlockData>,
      waypoints: [] as string[],
      startpoint: "",
    },
  },
  $seed: "",
  $key: "",
  $visited: 0,
  $formatted_with_visited: false,
  visited: {} as Record<string, number>,
  returned: {},
  array: { default: [] },
});

export type LogicBuiltins = ReturnType<typeof logicBuiltins>;
