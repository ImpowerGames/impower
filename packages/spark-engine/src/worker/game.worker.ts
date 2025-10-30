import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { installGameWorker } from "./installGameWorker";

const connection = new Port2MessageConnection((message: any, transfer) =>
  self.postMessage(message, { transfer })
);
connection.listen();

installGameWorker(connection);

export default "";
