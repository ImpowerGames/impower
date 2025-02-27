import { SparkDeclaration } from "../types/SparkDeclaration";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownCompilerConfig } from "../types/SparkdownCompilerConfig";
import { getProperty } from "./getProperty";

export const getExpectedSelectorTypes = (
  program: SparkProgram,
  declaration: SparkDeclaration | undefined,
  config?: SparkdownCompilerConfig
) => {
  const structType = declaration?.type;
  const structName = declaration?.name;
  const structProperty = declaration?.property;
  if (structType && structProperty) {
    const expectedSelectorTypes = new Set<string>();
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
    const expectedPropertyValue =
      getProperty(
        program.context?.[structType]?.["$default"],
        expectedPropertyPath
      ) ??
      getProperty(
        program.context?.[structType]?.[`$optional:${structName}`],
        expectedPropertyPath
      ) ??
      getProperty(
        program.context?.[structType]?.["$optional"],
        expectedPropertyPath
      ) ??
      getProperty(
        config?.optionalDefinitions?.[structType]?.["$optional"],
        expectedPropertyPath
      );
    if (
      expectedPropertyValue &&
      typeof expectedPropertyValue === "object" &&
      "$type" in expectedPropertyValue &&
      typeof expectedPropertyValue.$type === "string"
    ) {
      expectedSelectorTypes.add(expectedPropertyValue.$type);
    }
    // Use the property value array specified in $schema to infer additional possible types
    const schemaPropertyValueArrays = [
      getProperty(
        program.context?.[structType]?.[`$schema:${structName}`],
        expectedPropertyPath
      ),
      getProperty(
        program.context?.[structType]?.["$schema"],
        expectedPropertyPath
      ),
      getProperty(
        config?.schemaDefinitions?.[structType]?.["$schema"],
        expectedPropertyPath
      ),
    ];
    for (const schemaPropertyValueArray of schemaPropertyValueArrays) {
      if (Array.isArray(schemaPropertyValueArray)) {
        for (const optionValue of schemaPropertyValueArray) {
          if (
            optionValue &&
            typeof optionValue === "object" &&
            "$type" in optionValue &&
            typeof optionValue.$type === "string"
          ) {
            expectedSelectorTypes.add(optionValue.$type);
          }
        }
      }
    }
    return Array.from(expectedSelectorTypes);
  }
  return [];
};
