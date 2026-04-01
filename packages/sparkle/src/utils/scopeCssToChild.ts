const scopeCssToChild = (css: string, childSelector?: string) =>
  css.replace(/(.+)([{])/g, `$1> ${childSelector ? childSelector : "*"} $2`);

export default scopeCssToChild;
