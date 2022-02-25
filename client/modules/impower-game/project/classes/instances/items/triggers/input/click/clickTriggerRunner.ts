import { InputCondition, VariableData } from "../../../../../../../data";
import { PointerEventType } from "../../../../../../../data/enums/pointerEventType";
import { ImpowerGame } from "../../../../../../../game";
import { TriggerRunner } from "../../../trigger/triggerRunner";
import { ClickTriggerData } from "./clickTriggerData";

export class ClickTriggerRunner extends TriggerRunner<ClickTriggerData> {
  /**
   * This method is called once at the start of the scene.
   * @param data The Click Trigger Data.
   * @param variables The run time variable data.
   * @param game The run time Impower Game.
   */
  init(
    data: ClickTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): void {
    function handleEvent(event: MouseEvent | PointerEvent | TouchEvent): void {
      const touchEvent = event as TouchEvent;
      const mouseEvent = event as MouseEvent;
      const pointerEvent = event as PointerEvent;

      if (mouseEvent) {
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: data.reference.parentContainerId,
          value: mouseEvent.button.toString(),
        });
      } else if (
        touchEvent &&
        touchEvent.touches &&
        touchEvent.touches.length === 1
      ) {
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: data.reference.parentContainerId,
          value: touchEvent.touches[0],
        });
      } else if (pointerEvent) {
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: data.reference.parentContainerId,
          value: pointerEvent.button.toString(),
        });
      }
    }

    function resetHeldEvent(): void {
      game.logic.setTriggerValue({
        pos: data.pos,
        line: data.line,
        id: data.reference.parentContainerId,
        value: null,
      });
    }

    function handleEmptyPhaserClickDown(data: {
      event: MouseEvent | PointerEvent | TouchEvent;
    }): void {
      const { event } = data;
      handleEvent(event);
    }

    function handleEmptyPhaserClickUp(data: {
      event: MouseEvent | PointerEvent | TouchEvent;
    }): void {
      const { event } = data;
      handleEvent(event);
    }

    let clickType: PointerEventType;

    // On mobile, pointerEvents in UI.tsx blocks game scene clicks.
    // So to capture clicks on phaser that isn't on images, subscribe to these onEmptyPhaserClick events.
    // This this will pass the input event that occurred in Phaser that didn't intersect with any gameObjects.
    // Check if this event matches any of the click triggers by feeding the event into the "handleEvent" function.
    // TODO: perhaps add a "isMobile" check.

    switch (data.action) {
      case InputCondition.Started:
        clickType = PointerEventType.PointerDown;
        if (game.isMobile) {
          game.input.events.onEmptyPhaserClickDown.addListener(
            handleEmptyPhaserClickDown
          );
        }
        break;
      case InputCondition.Stopped:
        clickType = PointerEventType.PointerUp;
        if (game.isMobile) {
          game.input.events.onEmptyPhaserClickUp.addListener(
            handleEmptyPhaserClickUp
          );
        }
        break;
      case InputCondition.Is:
        clickType = PointerEventType.PointerHeld;
        if (game.isMobile) {
          game.input.events.onEmptyPhaserClickDown.addListener(
            handleEmptyPhaserClickDown
          );
        }
        break;
      default:
        // Unhandled input condition.
        break;
    }

    // Subscribe to document click events.  Unsubscribe when the game ends.
    document.addEventListener(clickType, handleEvent);
    game.events.onEnd.addListener(() => {
      document.removeEventListener(clickType, handleEvent);
    });

    // Add a "pointerup" check for held actions.  This will reset the held trigger.
    if (data.action === InputCondition.Is) {
      document.addEventListener(PointerEventType.PointerUp, resetHeldEvent);
      game.events.onEnd.addListener(() => {
        document.removeEventListener(
          PointerEventType.PointerUp,
          resetHeldEvent
        );
      });
    }
  }

  shouldExecute(
    data: ClickTriggerData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const triggerState = game.logic.state.triggerStates[parentContainerId];

    if (
      triggerState !== undefined &&
      triggerState.value != null &&
      triggerState.value === data.button
    ) {
      if (!data.repeatable && triggerState.executionCount > 1) {
        return false;
      }

      if (data.action !== InputCondition.Is) {
        // Reset the trigger.  Held actions are reset on a separate event.
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: parentContainerId,
          value: null,
        });
      }
      return true;
    }

    return super.shouldExecute(data, variables, game);
  }
}
