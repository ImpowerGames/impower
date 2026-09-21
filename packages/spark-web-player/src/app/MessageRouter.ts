import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import { toResponseError } from "@impower/jsonrpc/src/common/utils/toResponseError";
import {
  DISCONNECTED,
  METHOD_NOT_FOUND,
  SUPERSEDED,
  type StreamMessage,
} from "../../../spark-engine/src/game/core/classes/Connection";
import type { Manager } from "./Manager";

type Answer =
  | { error: ResponseError; transfer?: ArrayBuffer[] }
  | { result: unknown; transfer?: ArrayBuffer[] }
  | undefined;

/**
 * The page's end of the game's message stream: hands each message the game
 * sends to the managers and sends the game one answer for every request.
 *
 * Every request is answered, so nothing the game waits on can wait for ever:
 * with the first manager's answer, with an error when no manager handles the
 * method, and with an error for each request still open when the page
 * disconnects.
 *
 * Every stream the game sends carries an epoch. A message from an older
 * stream than the newest one seen is dropped (a request among them is
 * answered with an error), so what a superseded preview still had in flight
 * cannot paint over the one that replaced it.
 */
export class MessageRouter {
  protected _managers: () => Iterable<Manager>;

  protected _reply: (message: Message, transfer?: ArrayBuffer[]) => void;

  protected _epoch = 0;
  /** The newest stream this page has seen. */
  get epoch() {
    return this._epoch;
  }

  /** Requests received and not yet answered: id to method. */
  protected _pending = new Map<string | number, string>();

  protected _disconnected = false;

  constructor(
    managers: () => Iterable<Manager>,
    reply: (message: Message, transfer?: ArrayBuffer[]) => void,
  ) {
    this._managers = managers;
    this._reply = reply;
  }

  receive(message: StreamMessage): void {
    const isRequest = "id" in message && "params" in message;
    if (!isRequest && "id" in message) {
      // A response: the page sends the game no requests of its own.
      return;
    }
    if (this._disconnected) {
      if (isRequest) {
        this.answerError(message, DISCONNECTED, "the page disconnected");
      }
      return;
    }
    const epoch = message.epoch;
    if (typeof epoch === "number") {
      if (epoch < this._epoch) {
        if (isRequest) {
          this.answerError(
            message,
            SUPERSEDED,
            `stream ${epoch} was superseded by stream ${this._epoch}`,
          );
        }
        return;
      }
      this._epoch = epoch;
    }
    if (isRequest) {
      void this.handleRequest(message as RequestMessage);
    } else {
      for (const manager of this._managers()) {
        try {
          manager.onReceiveNotification(message as NotificationMessage);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  /** Answer every open request with an error and every later one the same
   *  way: the page is going away, and nothing it was doing will finish. */
  disconnect(): void {
    this._disconnected = true;
    const pending = [...this._pending];
    this._pending.clear();
    for (const [id, method] of pending) {
      this._reply({
        jsonrpc: "2.0",
        id,
        method,
        error: { code: DISCONNECTED, message: "the page disconnected" },
      });
    }
  }

  protected async handleRequest(message: RequestMessage): Promise<void> {
    this._pending.set(message.id, message.method);
    // Every manager sees the request synchronously, as it arrives: a
    // handler that starts work before its first await must not slip behind
    // the notifications that follow the request.
    const answers = [...this._managers()].map((manager): Promise<Answer> => {
      try {
        return manager
          .onReceiveRequest(message)
          .catch((e) => ({ error: toResponseError(e) }));
      } catch (e) {
        return Promise.resolve({ error: toResponseError(e) });
      }
    });
    // A manager that handles the method wins over one that threw on it.
    const settled = await Promise.all(answers);
    const answer =
      settled.find((a) => a && !("error" in a)) ?? settled.find(Boolean);
    if (!this._pending.delete(message.id)) {
      // Already answered by a disconnect.
      return;
    }
    if (!answer) {
      this.answerError(
        message,
        METHOD_NOT_FOUND,
        `nothing on the page handles ${message.method}`,
      );
      return;
    }
    const { transfer, ...payload } = answer;
    this._reply(
      {
        jsonrpc: "2.0",
        id: message.id,
        method: message.method,
        // The game settles a request only on a defined result or an error.
        ...("error" in payload && payload.error !== undefined
          ? { error: payload.error }
          : { result: "result" in payload ? (payload.result ?? null) : null }),
      },
      transfer,
    );
  }

  protected answerError(message: Message, code: number, text: string): void {
    this._reply({
      jsonrpc: "2.0",
      id: (message as RequestMessage).id,
      method: message.method,
      error: { code, message: text },
    });
  }
}
