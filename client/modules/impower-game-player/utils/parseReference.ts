/**
 * Parses the internal URL reference into a selector (that can be used to find the
 * referenced element using `this.content.querySelector`).
 *
 * @param url - The reference string, e.g. "url(#id)", "url('#id')", "#id"
 */
export const parseReference = (url: string): string => {
  if (url.startsWith("url")) {
    let contents = url.slice(4, -1);

    if (contents.startsWith("'") && contents.endsWith("'")) {
      contents = contents.slice(1, -1);
    }

    return contents;
  }

  return url;
};
