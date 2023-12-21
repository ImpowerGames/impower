const getSectionAtLine = <T extends { line: number }>(
  line: number,
  sections: Record<string, T> | undefined
) => {
  const sectionEntries = Object.entries(sections || {});
  for (let i = sectionEntries.length - 1; i >= 0; i -= 1) {
    const [id, section] = sectionEntries[i] || [];
    if (id !== undefined && section !== undefined) {
      if (section.line !== undefined) {
        if (line >= section.line) {
          return id;
        }
      }
    }
  }
  return "";
};

export default getSectionAtLine;
