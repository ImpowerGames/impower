import { CallStack } from "./CallStack";
import { Choice } from "./Choice";
import { JsonSerialisation } from "./JsonSerialisation";
import { InkObject } from "./Object";
import { SimpleJson } from "./SimpleJson";
import { Story } from "./Story";
import { throwNullException } from "./NullException";

export class Flow {
  public name: string;
  public callStack: CallStack;
  public outputStream: InkObject[];
  public currentChoices: Choice[];
  // Output a continue cut off after its line ended, which the next continue
  // starts from (`StoryState.CarryOutputPastCut`).
  public carriedOutput: InkObject[] = [];

  constructor(name: String, story: Story);
  constructor(name: String, story: Story, jObject: Record<string, any>);
  constructor() {
    let name = arguments[0] as string;
    let story = arguments[1] as Story;

    this.name = name;
    this.callStack = new CallStack(story);

    if (arguments[2]) {
      let jObject = arguments[2] as Record<string, any>;

      this.callStack.SetJsonToken(jObject["callstack"], story);
      this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(
        jObject["outputStream"],
      );
      this.currentChoices = JsonSerialisation.JArrayToRuntimeObjList(
        jObject["currentChoices"],
      ) as Choice[];

      if (jObject["carriedOutput"] !== undefined) {
        this.carriedOutput = JsonSerialisation.JArrayToRuntimeObjList(
          jObject["carriedOutput"],
        );
      }

      let jChoiceThreadsObj = jObject["choiceThreads"];
      if (typeof jChoiceThreadsObj !== "undefined") {
        this.LoadFlowChoiceThreads(jChoiceThreadsObj, story);
      }
    } else {
      this.outputStream = [];
      this.currentChoices = [];
    }
  }

  public WriteJson(writer: SimpleJson.Writer) {
    writer.WriteObjectStart();

    writer.WriteProperty("callstack", (w) => this.callStack.WriteJson(w));
    writer.WriteProperty("outputStream", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.outputStream),
    );
    if (this.carriedOutput.length > 0) {
      writer.WriteProperty("carriedOutput", (w) =>
        JsonSerialisation.WriteListRuntimeObjs(w, this.carriedOutput),
      );
    }

    let hasChoiceThreads = false;
    for (let c of this.currentChoices) {
      if (c.threadAtGeneration === null)
        return throwNullException("c.threadAtGeneration");

      c.originalThreadIndex = c.threadAtGeneration.threadIndex;

      if (this.callStack.ThreadWithIndex(c.originalThreadIndex) === null) {
        if (!hasChoiceThreads) {
          hasChoiceThreads = true;
          writer.WritePropertyStart("choiceThreads");
          writer.WriteObjectStart();
        }

        writer.WritePropertyStart(c.originalThreadIndex);
        c.threadAtGeneration.WriteJson(writer);
        writer.WritePropertyEnd();
      }
    }

    if (hasChoiceThreads) {
      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteProperty("currentChoices", (w) => {
      w.WriteArrayStart();
      for (let c of this.currentChoices) {
        JsonSerialisation.WriteChoice(w, c);
      }
      w.WriteArrayEnd();
    });

    writer.WriteObjectEnd();
  }

  public LoadFlowChoiceThreads(
    jChoiceThreads: Record<string, any>,
    story: Story,
  ) {
    for (let choice of this.currentChoices) {
      let foundActiveThread = this.callStack.ThreadWithIndex(
        choice.originalThreadIndex,
      );
      if (foundActiveThread !== null) {
        choice.threadAtGeneration = foundActiveThread!.Copy();
      } else {
        let jSavedChoiceThread =
          jChoiceThreads[`${choice.originalThreadIndex}`];
        choice.threadAtGeneration = new CallStack.Thread(
          jSavedChoiceThread,
          story,
        );
      }
    }
  }
}
