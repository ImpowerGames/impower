const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;

const isIdentCodePoint = (code: number): boolean =>
  code >= 0x80 ||
  code === 0x2d ||
  code === 0x5f ||
  isDigit(code) ||
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a);

export const escapeCssIdentifier = (identifier: string): string => {
  const codes = Array.from(identifier, (char) => char.codePointAt(0)!);
  return codes
    .map((code, index) => {
      if (code === 0) {
        return "�";
      }
      if (
        (code >= 0x1 && code <= 0x1f) ||
        code === 0x7f ||
        (index === 0 && isDigit(code)) ||
        (index === 1 && isDigit(code) && codes[0] === 0x2d)
      ) {
        return `\\${code.toString(16)} `;
      }
      if (index === 0 && code === 0x2d && codes.length === 1) {
        return "\\-";
      }
      const char = String.fromCodePoint(code);
      return isIdentCodePoint(code) ? char : `\\${char}`;
    })
    .join("");
};

export const getThemeVariableName = (type: string, name: string): string => {
  const [tag, ...attributes] = name.split("~");
  return `--theme-${type}-${[tag, ...attributes.sort()].join("~")}`;
};
