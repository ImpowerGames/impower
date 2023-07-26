import { Logger } from "@impower/spark-editor-protocol/src/types";

export default class ConsoleLogger implements Logger {
  error(message: string) {
    console.error(message);
  }
  warn(message: string) {
    console.warn(message);
  }
  info(message: string) {
    console.info(message);
  }
  log(message: string) {
    console.log(message);
  }
}
