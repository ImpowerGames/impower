const entityMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

export const sanitize = (str: string) => {
  return str.replace(/[&<>"'`=]/g, (s) => {
    return entityMap[s] || s;
  });
};
