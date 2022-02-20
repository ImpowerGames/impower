import {
  createDynamicData,
  getSetOperatorSymbol,
  Permission,
  SetCommandData,
  SetOperator,
  TypeInfo,
  VariableTypeId,
} from "../../../../../../../data";
import { getDefaultVariableValue } from "../../../../../../../inspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { getValidSetOperators } from "../../../../../../../inspector/utils/getValidSetOperators";
import { CommandInspector } from "../../../command/commandInspector";

export class SetCommandInspector extends CommandInspector<SetCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Data",
      name: "Set",
      icon: "{x}",
      color: getProjectColor("orange", 5),
      description: "Sets a variable's current value",
    };
  }

  getSummary(_data: SetCommandData): string {
    return `{variable} {operator} {value}`;
  }

  createData(
    data?: Partial<SetCommandData> & Pick<SetCommandData, "reference">
  ): SetCommandData {
    return {
      ...super.createData(data),
      variable: {
        parentContainerType: "Block",
        parentContainerId: "",
        refType: "Variable",
        refTypeId: "" as VariableTypeId,
        refId: "",
      },
      operator: SetOperator.Assign,
      value: createDynamicData(""),
      ...data,
    };
  }

  validate(data: SetCommandData): SetCommandData {
    if (
      data.variable &&
      data.variable.refTypeId &&
      typeof getDefaultVariableValue(data.variable) !==
        typeof data.value.constant
    ) {
      const { variable } = data;
      const lhs = getDefaultVariableValue(variable);
      const validOperators = getValidSetOperators(lhs);
      return {
        ...data,
        operator: validOperators.includes(data.operator)
          ? data.operator
          : validOperators[0],
        value: {
          ...data.value,
          constant: getDefaultVariableValue(data.variable),
        },
      };
    }
    return super.validate(data);
  }

  getPropertyPermission(
    propertyPath: string,
    data: SetCommandData
  ): Permission {
    if (propertyPath === "variable") {
      return Permission.Set;
    }
    return super.getPropertyPermission(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: SetCommandData,
    value: unknown
  ): string {
    if (propertyPath === "operator") {
      if (value !== undefined) {
        return getSetOperatorSymbol(value as SetOperator);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(propertyPath: string, data?: SetCommandData): unknown[] {
    if (propertyPath === "operator") {
      if (data) {
        const { variable } = data;
        const lhs = getDefaultVariableValue(variable);
        return Object.values(getValidSetOperators(lhs));
      }
    }
    return super.getPropertyOptions(propertyPath, data);
  }
}
