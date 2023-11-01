import getScopedContext from "./getScopedContext";

// TODO: Also include struct objects in scopedContext
const getScopedValueContext = <
  T extends {
    name: string;
    parent?: string;
    children?: string[];
    variables?: Record<string, { name: string; type: string; value: string }>;
  }
>(
  sectionId: string,
  sections: Record<string, T>,
  compiler: (expr: string, context?: Record<string, unknown>) => unknown[]
): [Record<string, string>, Record<string, unknown>] => {
  const [sectionIds, sectionValues] = getScopedContext(
    "sections",
    sectionId,
    sections,
    compiler
  );
  const [variableIds, variableValues] = getScopedContext(
    "variables",
    sectionId,
    sections,
    compiler
  );
  return [
    { ...sectionIds, ...variableIds },
    {
      ...sectionValues,
      ...variableValues,
    },
  ];
};

export default getScopedValueContext;
