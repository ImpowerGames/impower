import {
  InputCondition,
  PressedKeyTriggerData,
  VariableValue,
} from "../../../../../../../data";
import { KeyEventType } from "../../../../../../../data/enums/keyEventType";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { TriggerRunner } from "../../../trigger/triggerRunner";

export class PressedKeyTriggerRunner extends TriggerRunner<PressedKeyTriggerData> {
  private _game: ImpowerGame;

  private isKeyDownResetRequired = false;

  /**
   * This method is called once at the start of the scene.
   * @param data The Pressed Key Trigger Data.
   * @param variables The run time variable data.
   * @param game The run time Impower Game.
   */
  init(
    data: PressedKeyTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): void {
    /**
     * This local function will reset the trigger state.
     * @param event The current keyboard event.
     * @param key The target key for the trigger.
     */
    function resetTrigger(event: KeyboardEvent, key: string): void {
      if (event.key === key) {
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: data.reference.parentContainerId,
          value: null,
        });
      }
    }

    this.handleEvent = this.handleEvent.bind(this);
    this.resetKeyDownEvent = this.resetKeyDownEvent.bind(this);
    this._game = game;
    const { action } = data;
    const keyVal = getRuntimeValue(data.key, variables, game);
    const blockId = data.reference.parentContainerId;

    let keyEvent: KeyEventType;
    switch (data.action) {
      case InputCondition.Started:
        keyEvent = KeyEventType.KeyDown;
        break;
      case InputCondition.Stopped:
        keyEvent = KeyEventType.KeyUp;
        break;
      case InputCondition.Is:
        keyEvent = KeyEventType.KeyHeld;
        break;
      default:
        // Unhandled input condition.
        break;
    }

    const pos = data?.pos;
    const line = data?.line;

    // Since these are anon subscriptions, make sure they're unique.  This is accomplished by passing in the keyVal.
    document.addEventListener(keyEvent, (event) => {
      this.handleEvent(event, keyVal, pos, line, blockId);
    });
    game.events.onEnd.addListener(() => {
      document.removeEventListener(keyEvent, (event) => {
        this.handleEvent(event, keyVal, pos, line, blockId);
      });
    });

    if (action !== InputCondition.Stopped) {
      // listen for a stopped reset
      if (action === InputCondition.Started) {
        // For "keydown" started events, have a reset variable that triggers when a key up is detected to prevent it from firing more than once.
        document.addEventListener(KeyEventType.KeyUp, (event) => {
          this.resetKeyDownEvent(event, keyVal);
        });
        game.events.onEnd.addListener(() => {
          document.removeEventListener(KeyEventType.KeyUp, (event) => {
            this.resetKeyDownEvent(event, keyVal);
          });
        });
      }

      // Add general "keyup" check for all "keydown" actions.  This will reset the trigger for these events.
      document.addEventListener(KeyEventType.KeyUp, (event) =>
        resetTrigger(event, keyVal)
      );
      game.events.onEnd.addListener(() => {
        document.removeEventListener(KeyEventType.KeyUp, (event) =>
          resetTrigger(event, keyVal)
        );
      });
    }
  }

  /**
   * This method will set the trigger state for the assigned key.
   * @param event The current keyboard event.
   * @param key The target key for the trigger.
   * @param block The target blockId for the trigger.
   */
  handleEvent(
    event: KeyboardEvent,
    key: string,
    pos: number,
    line: number,
    blockId: string
  ): void {
    if (event.key === key) {
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();

      this._game.logic.setTriggerValue({
        pos,
        line,
        id: blockId,
        value: key,
      });
    }
  }

  /**
   * This method used only for key down events.  The "isKeyDownResetRequired" variable allows key down events to fire only once.
   * Once this method is hit, the variable is reset and key down events can be used once again.
   * @param event The detected keyboard event.
   * @param key The target key.
   */
  resetKeyDownEvent(event: KeyboardEvent, key: string): void {
    if (event.key === key) {
      this.isKeyDownResetRequired = false;
    }
  }

  shouldExecute(
    data: PressedKeyTriggerData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): boolean {
    const { action } = data;
    const { parentContainerId } = data.reference;
    const triggerState = game.logic.state.triggerStates[parentContainerId];

    if (
      !this.isKeyDownResetRequired &&
      triggerState !== undefined &&
      triggerState.value != null
    ) {
      if (!data.repeatable && triggerState.executionCount > 1) {
        // Handle repeatable triggers by firing only if the execution count is less than 1.
        return false;
      }

      if (action !== InputCondition.Is) {
        // Reset the trigger.  Held actions are reset on a separate event.
        game.logic.setTriggerValue({
          pos: data.pos,
          line: data.line,
          id: parentContainerId,
          value: null,
        });

        if (action === InputCondition.Started) {
          // For keydown events, set this variable to prevent additional key down events from occuring until a key up event is found.
          this.isKeyDownResetRequired = true;
        }
      }
      return true;
    }

    return super.shouldExecute(data, variables, game);
  }
}
