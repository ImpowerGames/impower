const getFencedCode = (content: string, language = "sparkdown") =>
  `~~~${language}\n${content}\n~~~`;

export default getFencedCode;
