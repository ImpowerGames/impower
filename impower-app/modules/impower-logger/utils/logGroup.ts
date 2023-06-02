import { Logger } from "../types/classes/logger";
import { LogSource } from "../types/enums/logSource";

/**
 * Increases indentation of subsequent lines by two spaces.
 * If one or more `label`s are provided, those are printed first without the additional indentation.
 */
const logGroup = (
  source: LogSource,
  message?: unknown,
  ...optionalParams: unknown[]
): void => {
  const prefix =
    Logger.instance.currentGroups[0] === source
      ? message
      : `[${source}] ${message}`;
  Logger.instance.currentGroups.push(source);
  const color = "blue";
  const style = `color:${color};font-weight:bold;`;
  if (optionalParams?.length > 0) {
    // eslint-disable-next-line no-console
    console.group(`%c ${prefix}`, style, optionalParams);
  } else {
    // eslint-disable-next-line no-console
    console.group(`%c ${prefix}`, style);
  }
};

export default logGroup;
