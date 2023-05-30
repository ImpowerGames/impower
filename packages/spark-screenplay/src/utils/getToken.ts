export const getToken = (
  tokens: { type: string; text: string }[],
  type: string
): { type: string; text: string } | undefined => {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token && token.type === type) {
      return token;
    }
  }
  return undefined;
};
