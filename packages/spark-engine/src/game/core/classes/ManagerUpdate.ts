import { RequestMessage } from "../types/RequestMessage";
import { uuid } from "../utils/uuid";

export abstract class ManagerUpdate {
  protected _requests: RequestMessage[] = [];
  get requests() {
    return this._requests as Readonly<RequestMessage[]>;
  }

  request<T>(method: string, params: T) {
    this._requests.push({ id: uuid(), method, params });
  }
}
