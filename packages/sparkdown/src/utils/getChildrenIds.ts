const getChildrenIds = <T extends { children?: string[] }>(
  sectionId: string,
  sections?: Record<string, T>
): string[] => {
  const validSectionId = sectionId || "";
  const section = sections?.[validSectionId];
  return section?.children || [];
};

export default getChildrenIds;
