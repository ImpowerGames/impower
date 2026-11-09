const escapeLiteral = (text: string) =>
  text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

const expandStars = (text: string) =>
  text.split("*").map(escapeLiteral).join(".*");

const expandBraces = (group: string) =>
  `(${group.slice(1, -1).split(",").map(expandStars).join("|")})`;

export const globToRegex = (glob: string) => {
  const source = glob
    .split(/(\{[^{}]*\})/)
    .map((part, index) =>
      index % 2 === 1 ? expandBraces(part) : expandStars(part),
    )
    .join("");
  return RegExp(`^${source}$`, "i");
};
