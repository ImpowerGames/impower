import { Choice } from "@impower/sparkdown/src/inkjs/engine/Choice";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";

export interface SerializableRuntimeState {
  pathsExecutedThisFrame: string[];
  choicesEncountered: {
    options: string[];
    selected: number;
  }[];
}

export class RuntimeState {
  pathsExecutedThisFrame: Set<string> = new Set();

  choicesEncountered: {
    options: string[];
    selected: number;
  }[] = [];

  recordExecution(path: string) {
    if (!path.startsWith("global ")) {
      // Delete before adding so that last item in set is always the most recently executed
      this.pathsExecutedThisFrame.delete(path);
      this.pathsExecutedThisFrame.add(path);
    }
  }

  recordChoice(story: Story, choice: Choice) {
    this.choicesEncountered.push({
      options: story.currentChoices.map((c) => c.text),
      selected: story.currentChoices.indexOf(choice),
    });
  }

  toJSON() {
    return JSON.stringify(this.toSerializable());
  }

  protected toSerializable(): SerializableRuntimeState {
    return {
      pathsExecutedThisFrame: Array.from(this.pathsExecutedThisFrame),
      choicesEncountered: this.choicesEncountered,
    };
  }

  protected fromSerializable(serializable: SerializableRuntimeState) {
    this.pathsExecutedThisFrame = new Set(serializable.pathsExecutedThisFrame);
    this.choicesEncountered = serializable.choicesEncountered;
    return;
  }

  static clone(state: RuntimeState) {
    const cloned = new RuntimeState();
    if (state) {
      cloned.pathsExecutedThisFrame = new Set(
        Array.from(state.pathsExecutedThisFrame)
      );
      cloned.choicesEncountered = JSON.parse(
        JSON.stringify(state.choicesEncountered)
      );
    }
    return cloned;
  }

  static fromJSON(json: string) {
    const obj = new RuntimeState();
    const serializable = JSON.parse(json);
    obj.fromSerializable(serializable);
    return obj;
  }
}
