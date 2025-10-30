import { ConnectMessage } from "../../common/classes/ConnectMessage";
import {
  MessageConnection,
  MessageConnectionEvents,
} from "./MessageConnection";

export class Port1MessageConnection extends MessageConnection {
  protected _port1: MessagePort;

  protected _messageBuffer: { message: any; transfer?: Transferable[] }[] = [];

  constructor(port1: MessagePort) {
    super((message, transfer) => port1.postMessage(message, { transfer }));
    this._port1 = port1;
  }

  override async connect(connection: MessageConnection, port2: MessagePort) {
    this._port1.start();
    return connection.sendRequest(ConnectMessage.type, {}, [port2]);
  }

  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    this._port1.addEventListener(event, listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    this._port1.removeEventListener(event, listener);
  }

  override postMessage(message: any, transfer?: Transferable[]) {
    this._port1.postMessage(message, { transfer });
  }
}
