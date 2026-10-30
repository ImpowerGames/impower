const LINE_REFERENCES = [
  /^(Expected '[^']*' \(to close '[^']*' at line )(\d+)(\))/,
  /(; did you forget to close \S+ at line )(\d+)(\?)$/,
  /^(Redefinition of type '[^']*', previously defined at line )(\d+)()$/,
];

export function withMessageLines(message: string, line: (n: number) => number): string {
  for (const pattern of LINE_REFERENCES) {
    message = message.replace(pattern, (_, before: string, n: string, after: string) => `${before}${line(Number(n))}${after}`);
  }
  return message;
}
