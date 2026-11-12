const CAPTURE_REFERENCE = /\$(\d+)|\$\{(\d+):\/(downcase|upcase)\}/g;

export const hasCaptureReferences = (name: unknown): name is string => {
  if (typeof name !== "string") {
    return false;
  }
  CAPTURE_REFERENCE.lastIndex = 0;
  return CAPTURE_REFERENCE.test(name);
};

export const expandCaptureReferences = (
  template: string,
  captures: ArrayLike<string | undefined>,
): string =>
  template.replace(
    CAPTURE_REFERENCE,
    (reference, plain: string | undefined, cased: string | undefined, command: string | undefined) => {
      const index = parseInt(plain ?? cased!, 10);
      if (index >= captures.length) {
        return reference;
      }
      let text = captures[index] ?? "";
      while (text[0] === ".") {
        text = text.slice(1);
      }
      return command === "downcase"
        ? text.toLowerCase()
        : command === "upcase"
          ? text.toUpperCase()
          : text;
    },
  );
