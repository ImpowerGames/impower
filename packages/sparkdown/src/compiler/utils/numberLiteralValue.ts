// The number the runtime makes of a number literal's text as written, with
// its digit-separating underscores already removed: JavaScript's conversion,
// and `parseInt` for binary digits, which `Number` reads only up to 2^53
// exactly. Unlike Luau, a binary or hexadecimal literal past 2^64 is not
// clamped to 2^64. The compiler (`lowerNumber`) and the IntegerParsing lint
// both read literals through this, so the lint warns about the value that
// actually runs.
export function numberLiteralValue(text: string): number {
  const prefix = text.slice(0, 2).toLowerCase();
  if (prefix === "0b") {
    const digits = text.slice(2);
    const binary =
      digits.length > 0 && [...digits].every((d) => d === "0" || d === "1");
    if (binary) return parseInt(digits, 2);
  }
  return Number(text);
}
