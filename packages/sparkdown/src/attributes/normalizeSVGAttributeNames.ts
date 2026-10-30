export const normalizeSVGAttributeNames = (svg: string): string =>
  svg.replace(
    /<[A-Za-z][\w:.-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g,
    (tag) => {
      const attributes = new Map(
        [
          ...tag.matchAll(
            /\s(data-name|serif:id|inkscape:label)\s*=\s*("[^"]*"|'[^']*')/g,
          ),
        ].map((match) => [match[1], match[2]]),
      );
      if (attributes.has("data-name")) return tag;
      const label =
        attributes.get("serif:id") ?? attributes.get("inkscape:label");
      return label
        ? tag.replace(/(\/?>)$/, (end) => ` data-name=${label}${end}`)
        : tag;
    },
  );

