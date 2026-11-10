const TAG = /^(?:\((\S*?)\))?(?:\s+|^)(\S+)$/;

export const splitTag = (
  tag: string,
): { modifier: string | undefined; expression: string } | null => {
  const match = TAG.exec(tag);
  return match ? { modifier: match[1], expression: match[2]! } : null;
};
