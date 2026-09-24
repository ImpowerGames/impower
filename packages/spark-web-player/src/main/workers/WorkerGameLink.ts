import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { PageFramedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PageFramedMessage";

type Listener = (message: any) => void;

/**
 * The page's end of the games in the player's worker (`installPlayerWorker`),
 * the one that previews and PLAY's, over the connection the workspace
 * compiles through. The worker sends the page one game's stream at a time.
 *
 * What the worker's game sends is told apart from the compiler's traffic by
 * its `epoch`: the engine's `Connection` stamps every message it sends with
 * one, and nothing else on the connection carries it. Each such message goes
 * to the attached sink (the `Application`'s router) and to the listeners for
 * its method, as a page-resident game's `connection.outgoing` would deliver
 * it; what the page answers goes back through `receive`.
 *
 * PLAY's game sends its stream on a `BroadcastChannel` of its sink's own
 * instead (`attachPlay`). After input, Chromium holds a message from a worker or
 * a port until the page has rendered its next frame, which put a median of
 * 8 ms between a click and the game's answer; a broadcast channel's messages
 * are not held, and arrive in a median of 0.3 ms (#811). The channel's name
 * is made for the sink, so no other page of the editor hears it, and closing
 * it on detach leaves a stopped run nothing to write into. While the channel
 * is open, the game messages the connection carries are not delivered.
 *
 * While PLAY's sink is attached, the link also tells the worker each time the
 * page has finished rendering a frame (`PageFramedMessage`), and the worker's
 * games tick on it, so what a tick posts reaches a page that is not
 * rendering. The stopped preview never ticks, so its sink has neither.
 */
export class WorkerGameLink {
  protected _connection: MessageConnection;

  protected _sink?: (message: Message) => void;

  protected _channel?: BroadcastChannel;

  protected _listeners = new Map<string, Set<Listener>>();

  constructor(connection: MessageConnection) {
    this._connection = connection;
    connection.addEventListener("message", this.onConnectionMessage);
  }

  /** The two transports keep no order between them, and each game numbers
   *  its stream's epochs from one, so while PLAY's channel is open a game
   *  message the connection still carries (the preview's) would reach PLAY's
   *  sink in any order and could supersede its stream. */
  protected onConnectionMessage = (e: MessageEvent) => {
    if (!this._channel) {
      this.onMessage(e);
    }
  };

  protected onMessage = (e: MessageEvent) => {
    const message = e.data;
    if (
      !message ||
      typeof message.epoch !== "number" ||
      !(isRequest(message) || isNotification(message))
    ) {
      return;
    }
    this._sink?.(message);
    const listeners = this._listeners.get(message.method);
    if (listeners) {
      for (const listener of listeners) {
        listener(message);
      }
    }
  };

  /** Deliver the game's messages to `sink` from now on. */
  attach(sink: (message: Message) => void): void {
    this.closeChannel();
    this._sink = sink;
  }

  /** Deliver PLAY's game's messages to `sink` from now on, both those sent
   *  on the connection and those sent on the channel whose name this
   *  returns, which is the sink's until it is detached, and tell the worker
   *  of the page's frames until then. */
  attachPlay(sink: (message: Message) => void): string {
    this.attach(sink);
    const name = `impower-game-${crypto.randomUUID()}`;
    const channel = new BroadcastChannel(name);
    channel.onmessage = this.onMessage;
    this._channel = channel;
    this.sendFrames();
    return name;
  }

  /** Stop delivering the game's messages to `sink`, if it is attached. */
  detach(sink?: (message: Message) => void): void {
    if (!sink || this._sink === sink) {
      this._sink = undefined;
      this.closeChannel();
    }
  }

  protected closeChannel() {
    this._channel?.close();
    this._channel = undefined;
  }

  protected _framesSent = false;

  /** Tell the worker each time the page has rendered a frame, while PLAY's
   *  sink is attached. A task a frame callback queues runs once the frame it
   *  belongs to has rendered. */
  protected sendFrames() {
    if (this._framesSent || typeof requestAnimationFrame !== "function") {
      return;
    }
    this._framesSent = true;
    const frame = () => {
      if (!this._channel) {
        this._framesSent = false;
        return;
      }
      setTimeout(() => {
        if (this._channel) {
          this._connection.postMessage(
            PageFramedMessage.type.notification({}),
          );
        }
      }, 0);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Hear every message of `method` the game sends. */
  addListener(method: string, listener: Listener): () => void {
    let listeners = this._listeners.get(method);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(method, listeners);
    }
    listeners.add(listener);
    return () => listeners!.delete(listener);
  }

  /** Send the game what the page answers or reports (a response, an event). */
  receive(message: Message): void {
    this._connection.postMessage(message);
  }

  request<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R> {
    return this._connection.sendRequest(type, params);
  }
}
