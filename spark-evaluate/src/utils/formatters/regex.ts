export const regexes: Record<string, Record<string, string>> = {
  A: {
    "^[aeiouAEIOU]": "An",
    "": "A",
  },
  a: {
    "^[aeiouAEIOU]": "an",
    "": "a",
  },
};

export const regex = (
  value: string,
  _locale: string,
  arg: string
): [
  string,
  {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[],
  number[]
] => {
  const configRegexes = regexes;
  const varRegexes: { [regex: string]: string } = configRegexes?.[arg] || {};
  const varRegexEntries = Object.entries(varRegexes);
  for (let i = 0; i < varRegexEntries.length; i += 1) {
    const [regex, replacement] = varRegexEntries[i] || [];
    if (regex !== undefined && replacement !== undefined) {
      if (new RegExp(regex).test(value)) {
        return [replacement, [], []];
      }
    }
  }
  const result = varRegexes[""] || "";
  return [result, [], []];
};
