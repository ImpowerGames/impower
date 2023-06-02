const scopeCssToHost = (css: string) =>
  css.replace(/((?:^|\n)\s*)(.+)(\s+[>])/g, `$1:host($2)$3`);

export default scopeCssToHost;
