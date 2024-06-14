import { Module } from "../../../core/classes/Module";
import { FlowBuiltins, flowBuiltins } from "../flowBuiltins";
import { flowCommands } from "../flowCommands";
import { DidExecuteMessageMap } from "./messages/DidExecuteMessage";
import { WillExecuteMessageMap } from "./messages/WillExecuteMessage";

export interface FlowState {
  seed?: string;
  checkpoint?: string;
}

export type FlowMessageMap = DidExecuteMessageMap & WillExecuteMessageMap;

export class FlowModule extends Module<
  FlowState,
  FlowMessageMap,
  FlowBuiltins
> {
  override getBuiltins() {
    return flowBuiltins();
  }

  override getStored() {
    return [];
  }

  override getCommands() {
    return flowCommands(this._game);
  }

  override onStart() {}

  override onDestroy() {}

  override onUpdate(deltaMS: number) {
    return true;
  }

  override onPreview(checkpointId: string) {
    return super.onPreview(checkpointId);
  }

  override onCheckpoint(id: string) {}
}
