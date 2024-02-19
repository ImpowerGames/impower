export const getImportContent = (properties: Record<string, any>): string => {
  let textContent = "";
  Object.entries(properties).forEach(([k, v]) => {
    if (!k.includes("$")) {
      if (v) {
        if (Array.isArray(v)) {
          v.forEach((x) => {
            if (x && typeof x === "string") {
              textContent += `\n@import url('${x}');`;
            }
          });
        } else if (v && typeof v === "string") {
          textContent += `\n@import url('${v}');`;
        }
      }
    }
  });
  textContent = textContent.trim();
  return textContent;
};
