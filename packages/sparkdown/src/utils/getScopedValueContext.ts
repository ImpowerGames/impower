import { getScopedContext } from "./getScopedContext";

export const getScopedValueContext = <
  T extends {
    name: string;
    parent?: string;
    children?: string[];
    variables?: Record<string, { name: string; value: unknown }>;
  }
>(
  sectionId: string,
  sections?: Record<string, T>
): [Record<string, string>, Record<string, unknown>] => {
  const [sectionIds, sectionValues] = getScopedContext(
    "sections",
    sectionId,
    sections
  );
  const [variableIds, variableValues] = getScopedContext(
    "variables",
    sectionId,
    sections
  );
  return [
    { ...sectionIds, ...variableIds },
    {
      ...sectionValues,
      ...variableValues,
    },
  ];
};
