export const getImportContent = (properties: Record<string, any>): string => {
  let textContent = "";
  Object.entries(properties).forEach(([, v]) => {
    if (v && typeof v === "string") {
      textContent += `\n@import url('${v}');`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
