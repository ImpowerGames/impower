import { Logger } from "../types/classes/logger";

/**
 * Decreases indentation of subsequent lines by two spaces.
 */
const logGroupEnd = (): void => {
  Logger.instance.currentGroups.pop();
  // eslint-disable-next-line no-console
  console.groupEnd();
};

export default logGroupEnd;
