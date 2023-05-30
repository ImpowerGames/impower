import { Logger } from "../types/classes/logger";
import { LogSource } from "../types/enums/logSource";

/**
 * Ends measurement
 */
const logInfoEnd = (
  source: LogSource,
  message?: unknown,
  ...optionalParams: unknown[]
): void => {
  const prefix =
    Logger.instance.currentGroups[0] === source
      ? message
      : `[${source}] ${message}`;
  const startMark = [prefix, ...optionalParams].join(" ");
  const endMark = ["END", prefix, ...optionalParams].join(" ");
  performance.mark(endMark);
  performance.measure(`DOING ${startMark}`, startMark, endMark);
};

export default logInfoEnd;
