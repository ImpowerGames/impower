import { h, render } from "preact";
import type { GamePlayerController } from "../GamePlayerController";
import PlayerBar from "../components/PlayerBar/PlayerBar";

export const mountPlayerBar = (
  controller: Pick<GamePlayerController, "subscribeBar">,
  container: HTMLElement = document.createElement("div"),
) => {
  const unsubscribe = controller.subscribeBar((state, view) => {
    render(
      h(PlayerBar, {
        state,
        controls: {},
        workspace: view.workspace,
        routeShown: view.routeShown,
        snapping: view.snapping,
      }),
      container,
    );
  });
  const bar = (selector: string) => {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`The player bar has no ${selector}`);
    }
    return element;
  };
  return Object.assign(bar, {
    container,
    unmount: () => {
      unsubscribe();
      render(null, container);
    },
  });
};
