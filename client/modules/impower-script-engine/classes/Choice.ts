import { NullException } from "./NullException";
import { Path } from "./Path";
import { RuntimeObject } from "./RuntimeObject";
import { Thread } from "./Thread";

export class Choice extends RuntimeObject {
  public text = "";

  public index = 0;

  public threadAtGeneration: Thread = null;

  public sourcePath = "";

  public targetPath: Path = null;

  public isInvisibleDefault = false;

  public originalThreadIndex = 0;

  get pathStringOnChoice(): string {
    if (this.targetPath === null) {
      throw new NullException("Choice.targetPath");
    }
    return this.targetPath.toString();
  }

  set pathStringOnChoice(value: string) {
    this.targetPath = new Path(value);
  }
}
