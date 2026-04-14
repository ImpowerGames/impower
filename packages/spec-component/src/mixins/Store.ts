import { IStore } from "../types/IStore";
import { emit } from "../utils/emit";

export const Store = <T extends object>(
  data: T,
  event?: string,
  target?: EventTarget,
): new () => IStore<T> => {
  class Store implements IStore<T> {
    #event = event;
    get event() {
      return this.#event || "update:store";
    }

    #target = target;
    get target() {
      return this.#target || window;
    }

    #current = data;
    get current() {
      return this.#current;
    }
    set current(v) {
      this.#current = v;
      emit(this.event, v, this.target);
    }
  }
  return Store;
};
