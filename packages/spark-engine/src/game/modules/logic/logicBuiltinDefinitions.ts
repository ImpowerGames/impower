export const logicBuiltins = () => ({
  config: {
    logic: {},
  },
  $seed: "",
  $key: "",
  $visited: 0,
  $formatted_with_visited: false,
  visited: {} as Record<string, number>,
  returned: {},
  array: { default: [] },
});

export interface LogicBuiltins extends ReturnType<typeof logicBuiltins> {}
