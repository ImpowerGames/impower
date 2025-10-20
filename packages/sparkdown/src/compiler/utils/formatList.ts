export const formatList = (arr: string[]) => {
  const quotedList = arr.map((c) => `'${c}'`);
  return quotedList.length === 1
    ? quotedList[0]
    : quotedList.length === 2
    ? `${quotedList[0]} or ${quotedList[1]}`
    : quotedList.slice(0, -1).join(", ") + `, or ${quotedList.at(-1)}`;
};
