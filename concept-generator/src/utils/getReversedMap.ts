export const getReversedMap = (map: {
  [key: string]: string[];
}): { [value: string]: string[] } => {
  const reversedMap: { [value: string]: string[] } = {};
  Object.entries(map).forEach(([key, value]) => {
    value.forEach((v) => {
      if (!reversedMap[v]) {
        reversedMap[v] = [];
      }
      reversedMap[v]?.push(key);
    });
  });

  return reversedMap;
};
