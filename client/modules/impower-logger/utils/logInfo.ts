import { Logger } from "../types/classes/logger";
import { LoggingLevel } from "../types/enums/loggingLevel";
import { LogSource } from "../types/enums/logSource";

/**
 * Prints to `stdout` with newline.
 */
const logInfo = (
  source: LogSource,
  message?: unknown,
  ...optionalParams: unknown[]
): void => {
  const prefix =
    Logger.instance.currentGroups[0] === source
      ? message
      : `[${source}] ${message}`;
  performance.mark([prefix, ...optionalParams].join(" "));
  if (Logger.instance.level <= LoggingLevel.Info) {
    const style =
      typeof message !== "string"
        ? "color:black"
        : message.includes("GET CACHED")
        ? `color:green;font-weight:bold;`
        : message.includes("GET") ||
          message.includes("CREATE") ||
          message.includes("UPDATE") ||
          message.includes("DELETE") ||
          message.includes("SET") ||
          message.includes("REMOVE") ||
          message.includes("UPLOAD")
        ? `color:red;font-weight:bold;`
        : "";
    if (optionalParams?.length > 0) {
      // eslint-disable-next-line no-console
      console.info(`%c ${prefix}`, style, optionalParams);
    } else {
      // eslint-disable-next-line no-console
      console.info(`%c ${prefix}`, style);
    }
  }
};

export default logInfo;
