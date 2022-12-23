import { Formatter } from "../types/Formatter";
import { format } from "../utils/format";

export const DEFAULT_COMPILER_CONFIG: {
  formatter?: Formatter;
} = {
  formatter: format,
};
