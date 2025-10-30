import {
  MessageConnection,
  MessageConnectionEvents,
} from "./MessageConnection";

export class SelfMessageConnection extends MessageConnection {
  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    self.addEventListener(event, listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    self.removeEventListener(event, listener);
  }
}
