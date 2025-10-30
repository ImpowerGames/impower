import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { installSparkdownWorker } from "./installSparkdownWorker";

const connection = new Port2MessageConnection((message: any, transfer) =>
  self.postMessage(message, { transfer })
);
connection.listen();

installSparkdownWorker(connection);

export default "";
