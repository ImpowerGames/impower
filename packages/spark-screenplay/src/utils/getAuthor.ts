export const getAuthor = (frontMatter: Record<string, string[]>) => {
  return (
    (frontMatter["author"]?.join("\n") || "") +
    (frontMatter["authors"]?.join("\n") || "")
  );
};
