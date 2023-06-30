import { Completion } from "@codemirror/autocomplete";

const toSet = (chars: Set<string>) => {
  let preamble = "";
  let flat = Array.from(chars).join("");
  const words = /\w/.test(flat);
  if (words) {
    preamble += "\\w";
    flat = flat.replace(/\w/g, "");
  }
  return `[${preamble}${flat.replace(/[^\w\s]/g, "\\$&")}]`;
};

export const prefixMatch = (options: Completion[]): [RegExp, RegExp] => {
  const first = new Set<string>();
  const rest = new Set<string>();

  for (const { apply } of options) {
    const [initial, ...restStr] = apply as string;
    if (initial != null) {
      first.add(initial);
    }
    for (const char of restStr) {
      rest.add(char);
    }
  }

  const source = toSet(first) + toSet(rest) + "*$";
  return [new RegExp("^" + source), new RegExp(source)];
};
