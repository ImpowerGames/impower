import { Game } from "../../game";
import { InstanceData } from "../../project/classes/instance/InstanceData";
import { InstanceRunner } from "../../project/classes/instance/InstanceRunner";
import { BlockRunner } from "../../project/classes/instances/containers/block/BlockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/CommandRunner";
import { ConditionCommandRunner } from "../../project/classes/instances/items/commands/conditional/conditionCommand/ConditionCommandRunner";
import { AssignCommandRunner } from "../../project/classes/instances/items/commands/data/assignCommand/AssignCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/EndCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/EnterCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/LogCommandRunner";
import { RepeatCommandRunner } from "../../project/classes/instances/items/commands/flow/repeatCommand/RepeatCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/flow/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/WaitCommandRunner";

interface InstanceContextData<
  G extends Game,
  D extends InstanceData,
  R extends InstanceRunner<G, D>
> {
  runner: R;
  data: D;
}

export class GameRunner<G extends Game> {
  protected _blockRunner: BlockRunner<G> = new BlockRunner();

  public get blockRunner(): BlockRunner<G> {
    return this._blockRunner;
  }

  protected _commandRunners: Record<string, CommandRunner<G>> = {
    LogCommand: new LogCommandRunner(),
    EnterCommand: new EnterCommandRunner(),
    ReturnCommand: new ReturnCommandRunner(),
    RepeatCommand: new RepeatCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    ConditionCommand: new ConditionCommandRunner(),
    AssignCommand: new AssignCommandRunner(),
  };

  protected _commandRunnersList = Object.values(this._commandRunners);

  public get commandRunners(): readonly CommandRunner<G>[] {
    return this._commandRunnersList;
  }

  registerBlockRunner(_refTypeId: string, inspector: BlockRunner<G>): void {
    this._blockRunner = inspector;
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner<G>): void {
    this._commandRunners[refTypeId] = inspector;
    this._commandRunnersList = Object.values(this._commandRunners);
  }

  getRunner(typeLookup: {
    refType: "Config" | "Block" | "Command";
    refTypeId: string;
  }): InstanceRunner<G> {
    const { refType, refTypeId } = typeLookup;
    switch (refType) {
      case "Block": {
        return this._blockRunner || new BlockRunner();
      }
      case "Command": {
        return this._commandRunners[refTypeId] || new CommandRunner();
      }
      default:
        throw new Error(`'${refType}' not recognized as a DataType`);
    }
  }

  getRuntimeData<D extends InstanceData, R extends InstanceRunner<G, D>>(
    data: Record<string, D>
  ): InstanceContextData<G, D, R>[] {
    const runners: { runner: R; data: D }[] = [];
    Object.keys(data || {}).forEach((id) => {
      const d = data[id];
      if (d) {
        const r = this.getRunner(d.reference) as R;
        runners.push({ runner: r, data: d });
      }
    });
    return runners;
  }
}
