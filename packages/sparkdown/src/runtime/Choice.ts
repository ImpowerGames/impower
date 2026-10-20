import { CallStack } from "./CallStack";
import { InkObject } from "./Object";

export class Choice extends InkObject {
  public text: string = "";
  public index: number = 0;
  public threadAtGeneration: CallStack.Thread | null = null;
  public sourcePath: string = "";
  public isInvisibleDefault: boolean = false;
  public tags: string[] | null = null;
  public originalThreadIndex: number = 0;
}
