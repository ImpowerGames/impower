import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { ImageCompositeOptions } from "@impower/sparkdown/src/compiler/utils/getImageComposite";

export const createImageCompositeOptions = (workspace: {
  getFileBytes(uri: string): Promise<string | undefined>;
  morphRestRender(context: SparkProgram["context"], struct: any): Promise<string | undefined>;
}): ImageCompositeOptions => ({
  readFileBytes: (uri) => workspace.getFileBytes(uri),
  morphRest: (context, struct) => workspace.morphRestRender(context, struct),
});
