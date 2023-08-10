import getAncestorIds from "./getAncestorIds";

const getScopedIds = (
  sectionId: string,
  sections?: Record<
    string,
    {
      name: string;
      parent?: string;
      children?: string[];
      variables?: Record<string, { name: string }>;
    }
  >
): Record<string, string> => {
  const ancestorIds = getAncestorIds(sectionId);
  const result: Record<string, string> = {};
  ancestorIds.forEach((ancestorId) => {
    const section = sections?.[ancestorId];
    const items = section?.variables;
    if (items) {
      if (Array.isArray(items)) {
        items.forEach((id) => {
          const name = id.split(".").slice(-1).join("").replace(/^[*?]/, "");
          result[name] = id;
        });
      } else {
        Object.entries(items).forEach(([id, v]) => {
          result[v.name || ""] = id;
        });
      }
    }
  });
  return result;
};

export default getScopedIds;
