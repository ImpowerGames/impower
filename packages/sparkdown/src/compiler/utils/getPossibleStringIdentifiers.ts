import { SparkDeclaration } from "../types/SparkDeclaration";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { fetchProperty } from "./fetchProperty";
import { readProperty } from "./readProperty";

export const getPossibleStringIdentifiers = (
  program: SparkProgram,
  declaration: SparkDeclaration | undefined,
  config?: SparkdownCompilerConfig,
  state?: SparkdownCompilerState,
) => {
  const structType = declaration?.type;
  const structName = declaration?.name;
  const structProperty = declaration?.property;
  if (structType && structProperty) {
    const possibleStringIdentifiers = new Set<string>();
    // Use the default property value specified in $default and $optional to infer main type
    const propertyPath = program.context?.[structType]?.["$default"]?.[
      "$recursive"
    ]
      ? structProperty.split(".").at(-1) || ""
      : structProperty;
    const trimmedPropertyPath = propertyPath.startsWith(".")
      ? propertyPath.slice(1)
      : propertyPath;
    const expectedPropertyPath = trimmedPropertyPath
      .split(".")
      .map((x) => (!Number.isNaN(Number(x)) ? 0 : x))
      .join(".");
    // Use the property value array specified in $schema to infer additional possible types
    const schemaPropertyValueArrays = [
      state?.contextPropertyRegistry
        ? fetchProperty(
            expectedPropertyPath,
            state?.contextPropertyRegistry?.[structType]?.[
              `$schema:${structName}`
            ],
          )
        : readProperty(
            expectedPropertyPath,
            program.context?.[structType]?.[`$schema:${structName}`],
          ),
      state?.contextPropertyRegistry
        ? fetchProperty(
            expectedPropertyPath,
            state?.contextPropertyRegistry?.[structType]?.["$schema"],
          )
        : readProperty(
            expectedPropertyPath,
            program.context?.[structType]?.["$schema"],
          ),
      state?.contextPropertyRegistry
        ? fetchProperty(
            expectedPropertyPath,
            state?.contextPropertyRegistry?.[structType]?.["$schema"],
          )
        : readProperty(
            expectedPropertyPath,
            config?.definitions?.schemas?.[structType]?.["$schema"],
          ),
    ];
    for (const schemaPropertyValueArray of schemaPropertyValueArrays) {
      if (Array.isArray(schemaPropertyValueArray)) {
        for (const optionValue of schemaPropertyValueArray) {
          if (optionValue && typeof optionValue === "string") {
            possibleStringIdentifiers.add(optionValue);
          }
        }
      }
    }
    return Array.from(possibleStringIdentifiers);
  }
  return [];
};
