import { TypeInfo, BlockData, createBlockData } from "../../../../../data";
import { ContainerInspector } from "../../container/containerInspector";
import { getProjectColor } from "../../../../../inspector/utils/getProjectColor";

export class BlockInspector extends ContainerInspector<BlockData> {
  private static _instance: BlockInspector;

  public static get instance(): BlockInspector {
    if (!this._instance) {
      this._instance = new BlockInspector();
    }
    return this._instance;
  }

  getTypeInfo(): TypeInfo {
    return {
      category: "",
      name: "Block",
      icon: "square",
      color: getProjectColor("blue", 5),
      description:
        "Specifies which triggers an entity should respond to and what actions it should perform",
    };
  }

  createData(
    data?: Partial<BlockData> & Pick<BlockData, "reference">
  ): BlockData {
    return createBlockData(data);
  }

  allowVariableProperty(propertyPath: string, _data: BlockData): boolean {
    if (propertyPath === "disabled") {
      return false;
    }
    return true;
  }

  isPropertyVisible(propertyPath: string, data: BlockData): boolean {
    if (propertyPath === "nodePosition") {
      return false;
    }
    if (propertyPath === "triggers") {
      return false;
    }
    if (propertyPath === "commands") {
      return false;
    }
    if (propertyPath === "variables") {
      return false;
    }
    if (propertyPath === "disabled") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
