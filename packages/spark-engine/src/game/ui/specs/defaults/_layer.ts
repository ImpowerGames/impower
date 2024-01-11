import { Create } from "../../../core/types/Create";
import { Layer } from "../Layer";

export const _layer: Create<Layer> = (obj?: Partial<Layer>) => ({
  preserve: false,
  ...(obj || {}),
});
