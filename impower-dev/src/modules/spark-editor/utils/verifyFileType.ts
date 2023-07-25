export const verifyFileType = (type: string, accept: string): boolean => {
  const allowed = accept.split(",").map((x) => x.trim());
  return allowed.includes(type) || allowed.includes(type.split("/")[0] + "/*");
};
