export const getFencedCode = (code: string, language = "sparkdown") =>
  `~~~${language}\n${code}\n~~~`;
