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
import { AnimateElementsMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { BatchElementsMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/BatchElementsMessage";
import { BeatMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import type { Manager } from "./Manager";

function carriedRequests(message: Message): RequestMessage[] {
  if (!BeatMessage.type.isNotification(message as NotificationMessage)) {
    return [];
  }
  const { messages } = (message as NotificationMessage).params as {
    messages?: Message[];
  };
  return (messages ?? [])
    .flatMap((op) =>
      BatchElementsMessage.type.isNotification(op as NotificationMessage)
        ? (((op as NotificationMessage).params as { messages?: Message[] })
            ?.messages ?? [])
        : [op],
    )
    .filter((op): op is RequestMessage =>
      AnimateElementsMessage.type.isRequest(op as RequestMessage),
    );
}

type Answer =
  | { error: ResponseError; transfer?: ArrayBuffer[] }
  | { result: unknown; transfer?: ArrayBuffer[] }
  | undefined;

export class MessageRouter {
  protected _managers: () => Iterable<Manager>;

  protected _reply: (message: Message, transfer?: ArrayBuffer[]) => void;

  protected _epoch = 0;
  get epoch() {
    return this._epoch;
  }

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
      return;
    }
    if (this._disconnected) {
      for (const request of isRequest ? [message] : carriedRequests(message)) {
        this.answerError(request, DISCONNECTED, "the page disconnected");
      }
      return;
    }
    const epoch = message.epoch;
    if (typeof epoch === "number") {
      if (epoch < this._epoch) {
        for (const request of isRequest
          ? [message]
          : carriedRequests(message)) {
          this.answerError(
            request,
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

  answer(message: RequestMessage, work: Promise<Answer>): void {
    if (this._disconnected) {
      this.answerError(message, DISCONNECTED, "the page disconnected");
      void work.catch(() => {});
      return;
    }
    this._pending.set(message.id, message.method);
    void work
      .catch((e): Answer => ({ error: toResponseError(e) }))
      .then((answer) => this.settle(message, answer));
  }

  protected async handleRequest(message: RequestMessage): Promise<void> {
    this._pending.set(message.id, message.method);
    const answers = [...this._managers()].map((manager): Promise<Answer> => {
      try {
        return manager
          .onReceiveRequest(message)
          .catch((e) => ({ error: toResponseError(e) }));
      } catch (e) {
        return Promise.resolve({ error: toResponseError(e) });
      }
    });
    const settled = await Promise.all(answers);
    this.settle(
      message,
      settled.find((a) => a && !("error" in a)) ?? settled.find(Boolean),
    );
  }

  protected settle(message: RequestMessage, answer: Answer): void {
    if (!this._pending.delete(message.id)) {
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
