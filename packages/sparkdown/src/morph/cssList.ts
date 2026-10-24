/**
 * The entries of a comma-separated CSS list (a `background-image` value, a
 * computed `background-size`), in the order written, with commas inside
 * functions and quoted strings (a `url("data:…")`, a `linear-gradient(…)`)
 * kept in place. The engine counts a write's composed images with it and the
 * player splits the same value with it, so both agree on every image's place.
 */
export function cssList(list: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      values.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  values.push(list.slice(start).trim());
  return values;
}
