export const editorAtSend = <E extends { uri: string }>(
  uri: string,
  read: () => E | undefined,
): E | undefined => {
  const latest = read();
  return latest?.uri === uri ? latest : undefined;
};
