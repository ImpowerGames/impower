import fs from "fs";

const OUT_PATH = "vscode.html-custom-data.json";
const STRING_LITERAL_REGEX = /(["][^"]+["]|['][^']+[']|[`][^`]+[`])/g;
const QUOTE_REGEX = /(["'`])/g;
const CAMEL_CASE_REGEX = /([a-z](?=[A-Z]))/g;

const args = process.argv.slice(2);
const getTypeValues = (type: string): string[] | undefined => {
  let values: string[] | undefined;
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

export const getValues = (str: string): string[] | undefined => {
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
    return matches;
  }
  return getTypeValues(s);
};

export const normalize = (str: string): string => {
  if (!str) {
    return str;
  }
  const strippedStr = str.trim().startsWith("_") ? str.slice(1) : str;
  return camelCaseToKebabCase(strippedStr.replace(QUOTE_REGEX, ""));
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

  obj.modules.forEach((module: any) => {
    const declaration = module?.declarations?.[0];
    if (declaration && declaration.kind === "class") {
      let name = "";
      const description = String(declaration.description);
      const attributes: Attribute[] = [];
      if (declaration.members) {
        declaration.members.forEach((member: any) => {
          if (member.kind === "method" && member.name === "define") {
            if (member.parameters) {
              member.parameters.forEach((parameter: any) => {
                if (
                  (parameter.name === "tag" || parameter.name === "tagName") &&
                  parameter.default
                ) {
                  name = normalize(parameter.default);
                }
              });
            }
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
                  .flatMap((t) => getValues(t))
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
