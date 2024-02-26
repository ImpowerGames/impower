export const getTitle = (frontMatter: Record<string, string[]>) => {
  return frontMatter["title"]?.join("\n") || "";
};
