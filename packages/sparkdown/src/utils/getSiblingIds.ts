const getSiblingIds = (
  sectionId: string,
  sections?: Record<string, { parent?: string; children?: string[] }>
): string[] => {
  const validSectionId = sectionId || "";
  const result: string[] = [];
  const section = sections?.[validSectionId];
  const parentId = section?.parent;
  if (parentId != null) {
    const siblingIds = sections?.[parentId]?.children || [];
    siblingIds.forEach((id) => {
      const section = sections?.[id];
      if (section) {
        result.push(id);
      }
    });
  }
  return result || [];
};

export default getSiblingIds;
