export const getDocumentation = (
  info: string,
  example: string,
  language = "sparkdown"
) => `${info}\n\n~~~${language}\n${example}\n~~~`;
