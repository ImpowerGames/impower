import { Logger } from "../types/classes/logger";
import { LoggingLevel } from "../types/enums/loggingLevel";
import { LogSource } from "../types/enums/logSource";

/**
 * Prints to `stderr` with newline.
 */
const logError = (
  source: LogSource,
  message?: unknown,
  ...optionalParams: unknown[]
): void => {
  if (Logger.instance.level <= LoggingLevel.Error) {
    if (optionalParams?.length > 0) {
      console.error(`[${source}]`, message, optionalParams);
    } else {
      console.error(`[${source}]`, message);
    }
  }
};

export default logError;
