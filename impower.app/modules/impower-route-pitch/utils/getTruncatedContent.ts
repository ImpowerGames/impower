export const getTruncatedContent = (content: string, limit = 300): string => {
  if (!content) {
    return content;
  }
  if (content.length <= limit) {
    return content;
  }
  const cleanedContent = content.replace(/(?:\r\n|\r|\n)/g, "\n");
  for (let i = 0; i < limit + 1; i += 1) {
    // Truncate at first blank line before 300 characters
    if (
      cleanedContent[i] === "\n" &&
      (i + 1 >= cleanedContent.length || cleanedContent[i + 1] === "\n")
    ) {
      return cleanedContent.slice(0, i);
    }
  }
  for (let i = limit; i >= 0; i -= 1) {
    // Truncate at last space before 300 characters
    if (content[i] === " ") {
      return content.slice(0, i);
    }
  }
  return content.slice(0, limit + 1);
};
