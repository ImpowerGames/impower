import { Reference } from "@impower/sparkdown/src/compiler/classes/annotators/ReferenceAnnotator";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import { selectProperty } from "@impower/sparkdown/src/compiler/utils/selectProperty";

export const resolveSymbolId = (
  refId: string,
  reference: Reference | undefined,
  scopePath: string | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
) => {
  if (refId.startsWith("?.")) {
    if (!program || !reference?.selectors) {
      return null;
    }
    const expectedSelectorTypes = getExpectedSelectorTypes(
      program,
      reference?.assigned,
      config,
    );
    for (const selector of reference.selectors) {
      let [_, foundPath] = resolveSelector<any>(
        program,
        selector,
        expectedSelectorTypes,
      );
      if (foundPath) {
        return foundPath;
      }
    }
  }
  if (refId.startsWith(".")) {
    return scopePath + refId;
  }
  if (refId.includes("..")) {
    const [obj, foundPath] = selectProperty(program?.context, refId);
    if (obj !== undefined) {
      return foundPath;
    }
  }
  return refId;
};
