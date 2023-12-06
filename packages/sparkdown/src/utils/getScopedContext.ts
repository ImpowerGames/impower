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
      context[variableName] = compiler
        ? compiler(variable.value, context)
        : variable.compiled;
    });
  }
  return context;
};

export default getScopedContext;
