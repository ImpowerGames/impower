const getScopedContext = <
  Section extends {
    name: string;
    parent?: string;
    children?: string[];
  },
  Variable extends {
    name: string;
    type: string;
    value: string;
    compiled?: unknown;
  }
>(
  program: {
    sections?: Record<string, Section>;
    variables?: Record<string, Variable>;
  },
  compiler?: (expr: string, context?: Record<string, unknown>) => unknown[]
): Record<string, unknown> => {
  const context: Record<string, any> = {};
  if (program.sections) {
    Object.entries(program.sections).forEach(([sectionName]) => {
      context[sectionName] = 0;
    });
  }
  if (program.variables) {
    Object.entries(program.variables).forEach(([variableName, variable]) => {
      context[variableName] = compiler
        ? compiler(variable.value, context)
        : variable.compiled;
    });
  }
  return context;
};

export default getScopedContext;
