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
