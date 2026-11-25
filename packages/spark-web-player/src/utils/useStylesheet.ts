export const ensureStylesheet = (doc: Document, id: string, css: string) => {
  if (doc.getElementById(id)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.appendChild(style);
};
