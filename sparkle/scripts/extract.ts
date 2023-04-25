import fs from "fs";

const OUT_PATH = "vscode.html-custom-data.json";
const STRING_LITERAL_REGEX = /(["][^"]+["]|['][^']+[']|[`][^`]+[`])/g;
const QUOTE_REGEX = /(["'`])/g;
const CAMEL_CASE_REGEX = /([a-z](?=[A-Z]))/g;

export const camelCaseToKebabCase = (str: string): string => {
  return str.replace(CAMEL_CASE_REGEX, `$1-`).toLowerCase();
};

export const normalize = (str: string): string => {
  const strippedStr = str.startsWith("_") ? str.slice(1) : str;
  return camelCaseToKebabCase(strippedStr.replace(QUOTE_REGEX, ""));
};

try {
  const json = fs.readFileSync("./dist/custom-elements.json", "utf8");
  const obj = JSON.parse(json);

  interface Value {
    name: string;
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
                if (parameter.name === "tag") {
                  name = normalize(parameter?.default);
                }
              });
            }
          }
          if (member.kind === "field" && member.description) {
            const typeText = (member?.type?.text as string) || "";
            if (typeText === "boolean") {
              const attr = {
                name: normalize(member.name),
                description: member.description,
              };
              attributes.push(attr);
            } else {
              const matches = typeText.match(STRING_LITERAL_REGEX);
              if (matches) {
                const values = matches.map((name: string) => ({
                  name: normalize(name),
                }));
                const attr = {
                  name: normalize(member.name),
                  description: member.description,
                  values,
                };
                attributes.push(attr);
              }
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
