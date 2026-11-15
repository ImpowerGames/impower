import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { ImageCompositeOptions } from "@impower/sparkdown/src/compiler/utils/getImageComposite";

export const createImageCompositeOptions = (workspace: {
  getFileBytes(uri: string): Promise<string | undefined>;
  morphRestRender(context: SparkProgram["context"], struct: any, pick?: string): Promise<string | undefined>;
  morphShownLayers(context: SparkProgram["context"], struct: any, pick?: string): ReturnType<NonNullable<ImageCompositeOptions["shownLayers"]>>;
}): ImageCompositeOptions => ({
  readFileBytes: (uri) => workspace.getFileBytes(uri),
  morphRest: (context, struct, pick) => workspace.morphRestRender(context, struct, pick),
  shownLayers: (context, struct, pick) => workspace.morphShownLayers(context, struct, pick),
});
