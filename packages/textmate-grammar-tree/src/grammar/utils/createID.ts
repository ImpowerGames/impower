export const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
};

export const createID = (prefix = "") => {
  const suffix = Math.abs(hash(Math.random() * 100 + prefix));
  return `${prefix}-${suffix}`;
};
