const getScopedContext = <
  Variable extends {
    name: string;
    type: string;
    value: string;
    compiled?: unknown;
  }
>(
  variables?: Record<string, Variable>,
  compiler?: (expr: string, context?: Record<string, unknown>) => unknown[]
): Record<string, unknown> => {
  const context: Record<string, any> = {};
  if (variables) {
    Object.entries(variables).forEach(([variableName, variable]) => {
      const value = compiler
        ? compiler(variable.value, context)
        : variable.compiled;
      if (variable.type === "type") {
        context[variableName] ??= {};
        context[variableName][""] = value;
      } else if (typeof variable.compiled === "object") {
        context[variable.type] ??= {};
        context[variable.type][variable.name] = value;
      } else {
        context[variableName] = value;
      }
    });
  }
  return context;
};

export default getScopedContext;
