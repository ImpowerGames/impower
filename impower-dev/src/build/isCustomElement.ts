const reservedTags = [
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
];

const notReservedTag = (tagName: string) =>
  reservedTags.indexOf(tagName) === -1;

const isCustomElement = (tagName: string) => {
  return tagName.includes("-") && notReservedTag(tagName);
};

export default isCustomElement;
