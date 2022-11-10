import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { UIElement } from "../types/UIElement";

export interface UIEvents extends Record<string, GameEvent> {}

export interface UIConfig {
  elements: Record<string, UIElement>;
}

export interface UIState {}

export class UIManager extends Manager<UIEvents, UIConfig, UIState> {
  constructor(config?: Partial<UIConfig>, state?: Partial<UIState>) {
    const initialEvents: UIEvents = {};
    const initialConfig: UIConfig = { elements: {}, ...(config || {}) };
    const initialState: UIState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }
}
