import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ExportPDFMessage,
  ExportPDFParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage.js";
import { ProgressValue } from "@impower/spark-editor-protocol/src/types/base/ProgressValue";

export default class WorkspacePrint {
  protected _screenplayPdfWorker = new Worker(
    "/public/sparkdown-screenplay-pdf.js"
  );

  constructor() {
    this._screenplayPdfWorker.addEventListener(
      "message",
      this.handleWorkerMessage
    );
  }

  protected _messageQueue: Record<
    string,
    { resolve: (result: any) => void; reject: (err: any) => void }
  > = {};

  protected _progressQueue: Record<string, (value: ProgressValue) => void> = {};

  protected handleWorkerMessage = async (event: MessageEvent) => {
    const message = event.data;
    if (
      typeof message.method === "string" &&
      message.method.endsWith("/progress") &&
      typeof message.params?.token === "string"
    ) {
      const progressCallback = this._progressQueue[message.params.token];
      if (message.params.value) {
        progressCallback?.(message.params.value);
      }
    } else if (message.error) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.reject(message.error);
        delete this._messageQueue[message.id];
      }
    } else if (message.result !== undefined) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.resolve(message.result);
        delete this._messageQueue[message.id];
      }
    }
  };

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const request = type.request(params);
      this._messageQueue[request.id] = { resolve, reject };
      if (type.method === "workspace/exportPDF") {
        this._screenplayPdfWorker.postMessage(request, transfer);
      }
    });
  }

  async exportPDF(
    params: ExportPDFParams,
    onProgress?: (value: ProgressValue) => void
  ) {
    if (onProgress) {
      params.workDoneToken = ExportPDFMessage.type.uuid();
      this._progressQueue[params.workDoneToken] = onProgress;
    }
    return this.sendRequest(ExportPDFMessage.type, params);
  }
}
