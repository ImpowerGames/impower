const WRAPPED_STRING_REGEX = /^(`[^\n\r`]*`|"[^\n\r"]*"|'[^\n\r']*')$/;

export const unwrapString = (content: string): string => {
  if (content.match(WRAPPED_STRING_REGEX)) {
    return content.slice(1, -1);
  }
  return content;
};