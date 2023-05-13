import fs from "fs";

const OUT_PATH = "vscode.html-custom-data.json";
const STRING_LITERAL_REGEX = /(["][^"]+["]|['][^']+[']|[`][^`]+[`])/g;
const QUOTE_REGEX = /(["'`])/g;
const CAMEL_CASE_REGEX = /([a-z](?=[A-Z]))/g;
const MINIFY_REGEX = /([\n\r\t \\])/g;

export const parseArray = (str: string): string[] =>
  JSON.parse(str.replace(MINIFY_REGEX, "").replace(",]", "]"));

export const strip = (str: string): string =>
  str.trim().startsWith("_") ? str.slice(1) : str;

export const unquote = (str: string) => str.replace(QUOTE_REGEX, "");

export const normalize = (str: string): string => {
  if (!str) {
    return str;
  }
  return camelCaseToKebabCase(strip(unquote(str)));
};

const args = process.argv.slice(2);
const getTypeValues = (
  type: string,
  typeMap?: Record<string, string[]>
): string[] | undefined => {
  let values = typeMap?.[type];
  if (values) {
    return values;
  }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg) {
      if (arg === `--${type}`) {
        values = [];
      } else {
        if (values) {
          if (arg?.startsWith("--")) {
            break;
          }
          values.push(arg);
        }
      }
    }
  }
  return values;
};

export const camelCaseToKebabCase = (str: string): string => {
  return str.replace(CAMEL_CASE_REGEX, `$1-`).toLowerCase();
};

export const getValues = (
  str: string,
  typeMap?: Record<string, string[]>
): string[] | undefined => {
  const s = str.trim();
  if (
    s === "" ||
    s === "null" ||
    s === "undefined" ||
    s === "boolean" ||
    s === "number" ||
    s === "string" ||
    s === `""`
  ) {
    return undefined;
  }
  const matches = s.match(STRING_LITERAL_REGEX);
  if (matches) {
    return matches.map((s) => unquote(s));
  }
  return getTypeValues(strip(s), typeMap);
};

try {
  const json = fs.readFileSync("./dist/custom-elements.json", "utf8");
  const obj = JSON.parse(json);

  interface Value {
    name?: string;
  }

  interface Attribute {
    name?: string;
    description?: string;
    values?: Value[];
  }

  interface Reference {
    name?: string;
    url?: string;
  }

  const result: {
    version: string;
    tags: {
      name?: string;
      description?: string;
      attributes?: Attribute[];
      references?: Reference[];
    }[];
  } = {
    version: "1.0",
    tags: [],
  };

  const typeMap: Record<string, string[]> = {};

  obj.modules.forEach((module: any) => {
    const declaration = module?.declarations?.[0];

    if (
      declaration &&
      declaration.kind === "variable" &&
      declaration.summary &&
      declaration.type.text === declaration.summary + "[]"
    ) {
      typeMap[declaration.summary] = parseArray(declaration.default);
    } else if (declaration && declaration.kind === "class") {
      let name = "";
      const description = String(declaration.description);
      const attributes: Attribute[] = [];
      if (declaration.members) {
        declaration.members.forEach((member: any) => {
          if (member.kind === "field" && member.name === "tagName") {
            name = normalize(member.default);
          }
          if (member.kind === "field" && member.description && member.name) {
            const typeText = (member?.type?.text as string) || "";
            const attr: Attribute = {
              name: normalize(member.name),
              description: member.description,
            };
            if (typeText === "boolean") {
              attributes.push(attr);
            } else {
              const types = typeText.split("|");
              if (types) {
                const values = types
                  .flatMap((t) => getValues(t, typeMap))
                  .filter((v) => v != null)
                  .map((name) => ({ name }));
                if (values.length > 0) {
                  attr.values = values;
                }
                attributes.push(attr);
              }
            }
            if (member.summary) {
              attributes.push({ ...attr, name: member.summary });
            }
          }
        });
      }
      if (name) {
        const tag = { name, description, attributes };
        result.tags.push(tag);
      }
    }
  });

  fs.writeFile(OUT_PATH, JSON.stringify(result, null, 2), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", OUT_PATH);
    }
  });
} catch (err) {
  console.error(err);
}
