export const withThemeVariables = (html: string, themeCss: string): string => {
  if (!html.includes("<head>")) {
    throw new Error("The player document has no <head>");
  }
  return html.replace(
    "<head>",
    `<head>\n    <style id="theme-variables">\n${themeCss.trim()}\n    </style>`,
  );
};
