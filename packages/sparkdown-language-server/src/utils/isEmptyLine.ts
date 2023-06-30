const isEmptyLine = (lineText: string) =>
  lineText === "\n" || lineText === "\r\n" || lineText === "\r";

export default isEmptyLine;
