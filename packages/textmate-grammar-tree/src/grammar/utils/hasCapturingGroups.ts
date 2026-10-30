export const hasCapturingGroups = (regexp: RegExp) => {
  const always = new RegExp(`|${regexp.source}`);
  return always.exec("")!.length > 1;
};
