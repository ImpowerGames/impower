import { Logger } from "../types/classes/logger";
import { LoggingLevel } from "../types/enums/loggingLevel";
import { LogSource } from "../types/enums/logSource";

/**
 * Prints to `stderr` with newline.
 */
const logWarn = (
  source: LogSource,
  message?: unknown,
  ...optionalParams: unknown[]
): void => {
  if (Logger.instance.level <= LoggingLevel.Warning) {
    if (optionalParams?.length > 0) {
      console.warn(`[${source}]`, message, optionalParams);
    } else {
      console.warn(`[${source}]`, message);
    }
  }
};

export default logWarn;
