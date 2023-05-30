const chunk = <T>(array: T[], size: number): T[][] => {
  return array.reduce((arr, item, idx) => {
    return idx % size === 0
      ? [...(arr || []), [item]]
      : [...(arr || []).slice(0, -1), [...(arr || []).slice(-1)[0], item]];
  }, []);
};

export default chunk;
