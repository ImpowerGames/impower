import { assetNameOf, imageFileNameOf, imageMemberOf } from "@impower/sparkdown/src/attributes/imageFileName";
import { rasterLayerOfPath } from "@impower/sparkdown/src/attributes/rasterSource";
import { assetEndings, assetTypeOf } from "./assetTypes";
import { isScriptPath } from "./scriptFiles";

export const assetClaimOf = (rel: string, address?: string): string | undefined => {
  const leaf = rel.slice(rel.lastIndexOf("/") + 1);
  if (leaf.startsWith(".") || isScriptPath(rel) || rasterLayerOfPath(rel)) {
    return undefined;
  }
  const type = assetTypeOf(rel, assetEndings.peek(), address);
  const member = type === "image" ? imageFileNameOf(rel) : undefined;
  const name =
    member?.layer !== undefined ? imageMemberOf(member).replaceAll("%40", "@") : assetNameOf(rel, type);
  return name ? `${type}/${name}` : undefined;
};
