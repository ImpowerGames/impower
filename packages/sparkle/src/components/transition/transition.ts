import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_transition";

/**
 * Transitions are used to smoothly swap between two elements
 */
export default class Transition extends SparkleComponent(spec) {
  override onConnected() {
    window.addEventListener("exit", this.handleExit);
    window.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    window.removeEventListener("exit", this.handleExit);
    window.removeEventListener("enter", this.handleEnter);
  }

  updateStatus(status: "entering" | "exiting" | null) {
    this.updateRootAttribute("status", status);
  }

  protected handleExit = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        const routerKey = this.router;
        if (
          !routerKey ||
          (e.detail.key && (e.detail.key as string).startsWith(routerKey))
        ) {
          this.updateStatus("exiting");
        }
      }
    }
  };

  protected handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (this.shadowRoot) {
        const routerKey = this.router;
        if (
          !routerKey ||
          (e.detail.key && (e.detail.key as string).startsWith(routerKey))
        ) {
          this.updateStatus("entering");
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-transition": Transition;
  }
}
