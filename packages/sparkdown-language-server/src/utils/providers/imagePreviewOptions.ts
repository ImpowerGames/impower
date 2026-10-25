import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { ImageCompositeOptions } from "@impower/sparkdown/src/compiler/utils/getImageComposite";

/**
 * What hover and completion previews read images through. Asset previews
 * composite a layered image by reading its layers: impower-dev serves assets
 * over http so the worker just fetches them, and VS Code's srcs are workspace
 * uris a worker can't fetch, so the bytes come back over the extension
 * bridge. A variant a morph plays on previews as its rest render, baked by
 * the workspace.
 */
export const createImageCompositeOptions = (workspace: {
  getFileBytes(uri: string): Promise<string | undefined>;
  morphRestRender(context: SparkProgram["context"], struct: any): Promise<string | undefined>;
}): ImageCompositeOptions => ({
  readFileBytes: (uri) => workspace.getFileBytes(uri),
  morphRest: (context, struct) => workspace.morphRestRender(context, struct),
});
