import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { getVariantPicture, type ImageVariant } from "../../../packages/sparkdown-language-server/src/utils/providers/getVariantPicture";
import WorkspaceAssets from "../../src/modules/spark-editor/workspace/WorkspaceAssets";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import { Workspace as Base } from "./assetsTileSizesWorkspace";

const ROOT = "file:///p";

declare global {
  interface Window {
    pictureRequests: { uri: string; variant: ImageVariant; size: number; ms: number }[];
  }
}

window.pictureRequests = [];

let compiled: { files: unknown; context: Record<string, Record<string, unknown>> } | undefined;

const contextOf = () => {
  const files = workspace.assetListing.peek()!.files;
  if (compiled?.files !== files) {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri: `${ROOT}/main.sd`, name: "main", type: "script", ext: "sd", text: "", languageId: "sparkdown", version: 1 },
        ...Object.entries(files).map(([path, facts]) => {
          const leaf = path.split("/").at(-1)!;
          return {
            uri: `${ROOT}/${path}`,
            type: "image",
            name: leaf.split(".")[0]!,
            ext: leaf.split(".").at(-1)!,
            src: facts.src,
            version: 1,
          };
        }),
      ] as never,
    });
    compiled = { files, context: compiler.compile({ textDocument: { uri: `${ROOT}/main.sd` } }).program!.context! };
  }
  return compiled.context;
};

const assets = new WorkspaceAssets({
  fs: {
    getFileUri: (_: string, path: string) => `${ROOT}/${path}`,
    getRelativePath: (_: string, uri: string) => uri.slice(ROOT.length + 1),
  },
  ls: {
    getVariantPicture: async (uri: string, variant: ImageVariant, size: number) => {
      const request = { uri, variant, size, ms: Number.NaN };
      window.pictureRequests.push(request);
      const started = performance.now();
      const picture = await getVariantPicture(contextOf(), variant, { size });
      request.ms = performance.now() - started;
      return picture;
    },
  },
  window: {},
  autoRenameFiles: () => true,
} as never);

export const Workspace = {
  ...Base,
  assets: { ...Base.assets, requestPicture: (paths: readonly string[]) => assets.requestPicture(paths) },
};
