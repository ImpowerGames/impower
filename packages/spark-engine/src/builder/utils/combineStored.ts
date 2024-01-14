const combineStored = (
  stored: string[] | undefined,
  result: Set<string> = new Set<string>()
) => {
  if (!stored) {
    return result;
  }
  stored.forEach((v) => {
    result.add(v);
  });

  return result;
};

export default combineStored;
