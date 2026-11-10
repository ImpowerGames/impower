export interface TagModifier {
  parents: (string | null)[];
  suffix: "" | "/..." | "!";
}

const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const BARE = /^[^"/!]+/;

export const readTagModifier = (modifier: string, tag: string): TagModifier => {
  const fail = (reason: string): never => {
    throw new Error(`Invalid tag modifier in ${JSON.stringify(tag)}: ${reason}`);
  };
  const parents: (string | null)[] = [];
  let rest = modifier;
  while (rest) {
    if (rest === "...") {
      return { parents, suffix: "/..." };
    }
    if (rest === "!") {
      return { parents, suffix: "!" };
    }
    if (rest.startsWith('"')) {
      const quoted = QUOTED.exec(rest)?.[0] ?? fail(`unterminated quoted name ${rest}`);
      let name: unknown;
      try {
        name = JSON.parse(quoted);
      } catch {
        fail(`${quoted} is not a JSON string`);
      }
      parents.push(name as string);
      rest = rest.slice(quoted.length);
    } else {
      const bare = BARE.exec(rest)?.[0] ?? fail(`expected a name before ${JSON.stringify(rest)}`);
      if (bare === rest && bare.endsWith("...")) {
        fail(`${JSON.stringify(bare)} could be a name or a name followed by "..."; quote the name or add "/" before "..."`);
      }
      parents.push(bare === "*" ? null : bare);
      rest = rest.slice(bare.length);
    }
    if (!rest) {
      break;
    }
    if (!rest.startsWith("/")) {
      fail(`expected "/" after a name, found ${JSON.stringify(rest)}`);
    }
    rest = rest.slice(1);
  }
  return { parents, suffix: "" };
};
