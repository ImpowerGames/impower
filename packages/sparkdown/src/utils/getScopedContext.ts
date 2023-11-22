import getScopedIds from "./getScopedIds";
import getScopedSectionIds from "./getScopedSectionIds";

const getScopedContext = (
  itemsProp: "variables" | "sections",
  sectionId: string,
  sections: Record<
    string,
    {
      name: string;
      parent?: string;
      children?: string[];
      variables?: Record<
        string,
        { name: string; type: string; value: string; compiled?: unknown }
      >;
    }
  >,
  compiler?: (expr: string, context?: Record<string, unknown>) => unknown[]
): [Record<string, string>, Record<string, unknown>] => {
  const validSectionId = sectionId || "";
  const valueMap: Record<string, unknown> = {};
  if (itemsProp === "sections") {
    const ids = getScopedSectionIds(validSectionId, sections);
    Object.values(ids).forEach((id) => {
      const v = sections?.[id];
      if (v) {
        valueMap[v.name || ""] = 0;
      }
    });
    ids["#"] = validSectionId;
    valueMap["#"] = [0, ""];
    return [ids, valueMap];
  }
  const ids = getScopedIds(validSectionId, sections);
  Object.values(ids).forEach((id) => {
    const parentId = id.split(".").slice(0, -1).join(".");
    const items = sections?.[parentId]?.[itemsProp];
    const v = items?.[id];
    if (v) {
      valueMap[v.name || ""] = compiler
        ? compiler(v.value, valueMap)?.[0]
        : v.compiled;
    }
  });
  return [ids, valueMap];
};

export default getScopedContext;
