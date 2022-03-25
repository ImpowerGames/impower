export function newline(ch: number): boolean {
  return ch === "\n".charCodeAt(0) || ch === "\r".charCodeAt(0);
}
