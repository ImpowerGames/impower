const augmentCSS = (css: string, tagName: string): string =>
  css
    .replace(/(:host)[(]\s*([^>{]+)\s*[)](\s*(?:[>]|[{]|$))/g, `${tagName}$2$3`)
    .replace(/(:host)/g, `${tagName}`);

export default augmentCSS;
