const sortPhrases = (phrases: string[]): string[] => {
  if (!phrases) {
    return phrases;
  }
  const uniquePhrases = Array.from(new Set(phrases));
  const result = uniquePhrases
    .sort()
    .sort((a, b) => (a.length < b.length ? -1 : 1));
  return result;
};

export default sortPhrases;
