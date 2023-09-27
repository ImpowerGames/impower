import { IStore } from "../types/IStore";
import emit from "../utils/emit";

const Store = <T extends object>(
  data: T,
  event?: string,
  target?: EventTarget
) => {
  return class Store implements IStore<T> {
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
  };
};

export default Store;
