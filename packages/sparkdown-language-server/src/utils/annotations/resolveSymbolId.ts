import { Reference } from "@impower/sparkdown/src/classes/annotators/ReferenceAnnotator";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/utils/getExpectedSelectorTypes";
import { resolveSelector } from "@impower/sparkdown/src/utils/resolveSelector";
import { selectProperty } from "@impower/sparkdown/src/utils/selectProperty";

export const resolveSymbolId = (
  refId: string,
  reference: Reference | undefined,
  scopePath: string | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined
) => {
  if (refId.startsWith("?.")) {
    // Infer the type from the place it is used
    if (!program || !reference?.selector) {
      return null;
    }
    const expectedSelectorTypes = getExpectedSelectorTypes(
      program,
      reference?.assigned,
      config
    );
    let [_, foundPath] = resolveSelector<any>(
      program,
      reference.selector,
      expectedSelectorTypes
    );
    return foundPath;
  }
  if (refId.startsWith(".")) {
    // This reference is local to the scope
    return scopePath + refId;
  }
  if (refId.includes("..")) {
    // includes recursive search
    const [obj, foundPath] = selectProperty(program?.context, refId);
    if (obj !== undefined) {
      return foundPath;
    }
  }
  return refId;
};
