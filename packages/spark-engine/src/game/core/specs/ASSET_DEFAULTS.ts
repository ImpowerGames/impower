import { Asset } from "../types/Asset";
import { _asset } from "./_asset";

export const ASSET_DEFAULTS: Record<string, Asset> = { "": _asset() };
