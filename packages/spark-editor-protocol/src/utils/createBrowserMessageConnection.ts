import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
} from "vscode-jsonrpc/browser";
import { Logger } from "../types";

export const createBrowserMessageConnection = (
  worker: Worker,
  logger: Logger
) => {
  const reader = new BrowserMessageReader(worker);
  const writer = new BrowserMessageWriter(worker);
  return createMessageConnection(reader, writer, logger);
};
