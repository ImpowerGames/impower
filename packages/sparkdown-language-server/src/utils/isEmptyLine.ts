const isEmptyLine = (lineText: string) =>
  !lineText || lineText === "\n" || lineText === "\r\n" || lineText === "\r";

export default isEmptyLine;
