import type { Dimensions } from "../../../core";

import { getCssDimensions } from "./getCssDimensions";

export function getDimensions(element: Element): Dimensions {
  return getCssDimensions(element);
}
