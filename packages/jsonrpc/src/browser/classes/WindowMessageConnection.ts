import {
  MessageConnection,
  MessageConnectionEvents,
} from "./MessageConnection";

export class WindowMessageConnection extends MessageConnection {
  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    window.addEventListener(event, listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    window.removeEventListener(event, listener);
  }
}
