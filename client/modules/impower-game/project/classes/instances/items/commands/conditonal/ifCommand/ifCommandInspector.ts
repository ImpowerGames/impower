import {
  getParentPropertyPath,
  getPropertyName,
  getValue,
} from "../../../../../../../../impower-core";
import {
  CompareOperator,
  Condition,
  ContainerType,
  createDynamicData,
  getCompareOperatorSymbol,
  IfCommandData,
  ItemType,
  TypeInfo,
  VariableTypeId,
} from "../../../../../../../data";
import { getDefaultVariableValue } from "../../../../../../../inspector/utils/getDefaultVariableValue";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { getValidCompareOperators } from "../../../../../../../inspector/utils/getValidCompareOperators";
import { CommandInspector } from "../../../command/commandInspector";

export class IfCommandInspector extends CommandInspector<IfCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "If",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Executes child commands if the conditions are true",
    };
  }

  getConditionSummary(condition: Condition, conditionKey: string): string {
    if (condition?.variable?.refId) {
      const operatorSymbol = getCompareOperatorSymbol(condition.operator);
      return `({conditions.data.${conditionKey}.variable} ${operatorSymbol} {conditions.data.${conditionKey}.value})`;
    }
    return "";
  }

  getSummary(data: IfCommandData): string {
    const { conditions, checkAll } = data;
    let summary = "";
    if (conditions) {
      for (let i = 0; i < conditions.order.length; i += 1) {
        const conditionKey = conditions.order[i];
        const condition = conditions.data[conditionKey];
        if (condition) {
          summary += this.getConditionSummary(condition, conditionKey);
          if (conditions.order.length > 1 && i < conditions.order.length - 1) {
            if (checkAll) {
              summary += " && ";
            } else {
              summary += " || ";
            }
          }
        }
      }
    }
    return `${summary} {`;
  }

  createData(
    data?: Partial<IfCommandData> & Pick<IfCommandData, "reference">
  ): IfCommandData {
    return {
      ...super.createData(data),
      checkAll: false,
      conditions: {
        default: {
          variable: {
            parentContainerType: ContainerType.Block,
            parentContainerId: "",
            refType: ItemType.Variable,
            refTypeId: "" as VariableTypeId,
            refId: "",
          },
          operator: CompareOperator.Equals,
          value: createDynamicData(""),
        },
        order: [],
        data: {},
      },
      ...data,
    };
  }

  validate(data: IfCommandData): IfCommandData {
    const validateCondition = (c: Condition): Condition => {
      if (!c) {
        return c;
      }
      const defaultValue = getDefaultVariableValue(c.variable);
      const validDefaultValue = defaultValue !== null ? defaultValue : "";
      if (
        c.variable.refTypeId &&
        typeof validDefaultValue !== typeof c.value.constant
      ) {
        return {
          ...c,
          value: {
            ...c.value,
            constant: validDefaultValue,
          },
        };
      }
      return c;
    };
    if (data.conditions) {
      const newConditionData: { [key: string]: Condition } = {};
      Object.keys(data.conditions.data).forEach((key) => {
        newConditionData[key] = validateCondition(data.conditions.data[key]);
      });
      if (
        Object.entries(data.conditions.data).some((kvp) => {
          const [key, value] = kvp;
          return newConditionData[key] !== value;
        })
      ) {
        return {
          ...data,
          conditions: {
            ...data.conditions,
            data: newConditionData,
          },
        };
      }
    }
    return super.validate(data);
  }

  isPropertyCollapsible(propertyPath: string, _data: IfCommandData): boolean {
    if (propertyPath === "conditions") {
      return false;
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: IfCommandData): string {
    if (propertyPath === "conditions") {
      return "Condition";
    }
    if (getParentPropertyPath(propertyPath) === "conditions.data") {
      const value = getValue<Condition>(data, propertyPath);
      if (value !== undefined) {
        const index = data.conditions.order.indexOf(
          getPropertyName(propertyPath)
        );
        return `Condition ${index + 1}`;
      }
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: IfCommandData,
    value: unknown
  ): string {
    if (propertyPath.endsWith(".operator")) {
      if (value !== undefined) {
        return getCompareOperatorSymbol(value as CompareOperator);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyValueDescription(
    propertyPath: string,
    data: IfCommandData,
    value: unknown
  ): string {
    if (getParentPropertyPath(propertyPath) === "conditions.data") {
      const value = getValue<Condition>(data, propertyPath);
      if (value !== undefined) {
        return this.getConditionSummary(value, getPropertyName(propertyPath));
      }
    }
    return super.getPropertyValueDescription(propertyPath, data, value);
  }

  getPropertyOptions(propertyPath: string, data?: IfCommandData): unknown[] {
    if (propertyPath.endsWith(".operator")) {
      if (data) {
        const condition = getValue<Condition>(
          data,
          getParentPropertyPath(propertyPath)
        );
        if (condition !== undefined) {
          const { variable } = condition;
          const lhs = getDefaultVariableValue(variable);
          return Object.values(getValidCompareOperators(lhs));
        }
      }
    }
    return super.getPropertyOptions(propertyPath, data);
  }
}
