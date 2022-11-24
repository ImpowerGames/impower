import { InstanceData } from "../../project/classes/instance/InstanceData";
import { InstanceRunner } from "../../project/classes/instance/InstanceRunner";
import { BlockRunner } from "../../project/classes/instances/containers/block/BlockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/CommandRunner";
import { CommandTypeId } from "../../project/classes/instances/items/command/CommandTypeId";
import { ConditionCommandRunner } from "../../project/classes/instances/items/commands/conditional/conditionCommand/ConditionCommandRunner";
import { AssignCommandRunner } from "../../project/classes/instances/items/commands/data/assignCommand/AssignCommandRunner";
import { ChoiceCommandRunner } from "../../project/classes/instances/items/commands/dialog/choiceCommand/ChoiceCommandRunner";
import { DisplayCommandRunner } from "../../project/classes/instances/items/commands/dialog/displayCommand/DisplayCommandRunner";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/entity/destroyCommand/DestroyCommandRunner";
import { SpawnCommandRunner } from "../../project/classes/instances/items/commands/entity/spawnCommand/SpawnCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/EndCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/EnterCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/LogCommandRunner";
import { RepeatCommandRunner } from "../../project/classes/instances/items/commands/flow/repeatCommand/RepeatCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/flow/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/WaitCommandRunner";

interface InstanceContextData<
  D extends InstanceData,
  R extends InstanceRunner<D>
> {
  runner: R;
  data: D;
}

export class SparkGameRunner {
  static _instance: SparkGameRunner;

  static get instance(): SparkGameRunner {
    if (!this._instance) {
      this._instance = new SparkGameRunner();
    }
    return this._instance;
  }

  private _blockRunner: BlockRunner = new BlockRunner();

  public get blockRunner(): BlockRunner {
    return this._blockRunner;
  }

  private _commandRunners: Record<CommandTypeId, CommandRunner> &
    Record<string, CommandRunner> = {
    LogCommand: new LogCommandRunner(),
    EnterCommand: new EnterCommandRunner(),
    ReturnCommand: new ReturnCommandRunner(),
    RepeatCommand: new RepeatCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    ConditionCommand: new ConditionCommandRunner(),
    AssignCommand: new AssignCommandRunner(),
    DisplayCommand: new DisplayCommandRunner(),
    ChoiceCommand: new ChoiceCommandRunner(),
    SpawnCommand: new SpawnCommandRunner(),
    DestroyCommand: new DestroyCommandRunner(),
  };

  private _commandRunnersList = Object.values(this._commandRunners);

  public get commandRunners(): readonly CommandRunner[] {
    return this._commandRunnersList;
  }

  registerBlockRunner(_refTypeId: string, inspector: BlockRunner): void {
    this._blockRunner = inspector;
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner): void {
    this._commandRunners[refTypeId] = inspector;
    this._commandRunnersList = Object.values(this._commandRunners);
  }

  getRunner(typeLookup: {
    refType: "Config" | "Block" | "Command";
    refTypeId: string;
  }): InstanceRunner {
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

  getRuntimeData<D extends InstanceData, R extends InstanceRunner<D>>(
    data: Record<string, D>
  ): InstanceContextData<D, R>[] {
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
