import { Formatter } from "../types/Formatter";
import format from "../utils/format";

const DEFAULT_COMPILER_CONFIG: {
  formatter?: Formatter;
} = {
  formatter: format,
};

export default DEFAULT_COMPILER_CONFIG;
