import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { ImageCompositeOptions, ImagePick } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import type { PictureLook } from "@impower/sparkdown/src/morph/look";

export const createImageCompositeOptions = (workspace: {
  getFileBytes(uri: string): Promise<string | undefined>;
  morphRestRender(context: SparkProgram["context"], struct: any, pick?: string): Promise<string | undefined>;
  morphShownLayers(context: SparkProgram["context"], struct: any, pick?: ImagePick): ReturnType<NonNullable<ImageCompositeOptions["shownLayers"]>>;
  morphLook(context: SparkProgram["context"], struct: any, pick?: ImagePick): PictureLook;
}): ImageCompositeOptions => ({
  readFileBytes: (uri) => workspace.getFileBytes(uri),
  morphRest: (context, struct, pick) => workspace.morphRestRender(context, struct, pick),
  shownLayers: (context, struct, pick) => workspace.morphShownLayers(context, struct, pick),
  look: (context, struct, pick) => workspace.morphLook(context, struct, pick),
});
