import { StructDefinition as RuntimeStructDefinition } from "../../../../engine/StructDefinition";
import { StructPropertyDefinition } from "./StructPropertyDefinition";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { VariableAssignment } from "../Variable/VariableAssignment";
import { Identifier } from "../Identifier";
import { ObjectExpression } from "../Expression/ObjectExpression";

export class StructDefinition extends ParsedObject {
  override get typeName() {
    return "Define";
  }

  public modifier: Identifier | null = null;

  public type: Identifier | null = null;

  public name: Identifier | null = null;

  public variableAssignment: VariableAssignment | null = null;

  get key(): string {
    const typeId = this.type?.name || "";
    const nameId = this.name?.name || "";
    return [typeId, nameId].filter(Boolean).join(".");
  }

  get runtimeStructDefinition(): RuntimeStructDefinition {
    const modifierId = this.modifier?.name || "";
    const typeId = this.type?.name || "";
    const nameId = this.name?.name || "";
    const type = typeId;
    const nameParts = [];
    if (modifierId) {
      nameParts.push("$" + modifierId);
    }
    if (nameId) {
      nameParts.push(nameId);
    }
    const name = nameParts.join(":");
    const value = this.BuildValue(this.propertyDefinitions);
    if (value) {
      if (type) {
        value["$type"] = type;
      }
      if (name) {
        value["$name"] = name;
      }
    }
    return new RuntimeStructDefinition(type, name, value);
  }

  constructor(public propertyDefinitions: StructPropertyDefinition[]) {
    super();
    this.AddContent(propertyDefinitions as any);
  }

  public readonly GenerateRuntimeObject = () => {
    throw new Error("Not implemented.");
  };

  public override ResolveReferences(context: Story): void {
    super.ResolveReferences(context);
    context.CheckForNamingCollisions(this, this.identifier!, SymbolType.Struct);
  }

  BuildValue(propertyDefinitions: StructPropertyDefinition[]) {
    // console.log(
    //   propertyDefinitions
    //     .map(
    //       (p) =>
    //         `${" ".repeat(p.level)} ${p.identifier.name} = ${JSON.stringify(
    //           p.GetValue()
    //         )}`
    //     )
    //     .join("\n")
    // );
    let parentStack: {
      property: StructPropertyDefinition | null;
      value: any;
      currentPath: string;
    }[] = [{ property: null, value: {}, currentPath: "" }];
    const firstProp = propertyDefinitions[0];
    if (firstProp && firstProp.identifier.name === "-") {
      // Is defining array struct
      parentStack[0]!.value = [];
    }
    for (let i = 0; i < propertyDefinitions.length; i += 1) {
      const prop = propertyDefinitions[i]!;
      const nextProp = propertyDefinitions[i + 1];
      while (
        parentStack.length > 0 &&
        prop.level <=
          (parentStack[parentStack.length - 1]?.property?.level ?? 0) &&
        // Don't pop if this is an array item is at same indent level as non-array item parent
        !(
          parentStack[parentStack.length - 1]?.property?.identifier.name !==
            "-" &&
          prop.identifier.name === "-" &&
          prop.level === parentStack[parentStack.length - 1]?.property?.level
        )
      ) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];

      const parentPath = parent?.currentPath || "";
      let currentPropKey: string = "";
      // Construct the dot-access key for the current property
      if (prop.identifier.name === "-") {
        // Property is an array item
        if (parent && Array.isArray(parent.value)) {
          const index = parent.value.length;
          currentPropKey = `${parentPath}.${index}`;
        }
      } else {
        // Property is an object key
        const propName = prop.identifier.name;
        currentPropKey = `${parentPath}.${propName}`;
      }
      // Save the constructed dot-access key back to the property itself.
      if (currentPropKey) {
        prop.key = currentPropKey;
      }

      if (prop.expression instanceof ObjectExpression) {
        // If first child property is an array item, this property is an array
        const isArray =
          nextProp &&
          nextProp.level >= prop.level &&
          nextProp.identifier.name === "-";
        const value = isArray ? [] : {};
        if (parent) {
          if (prop.identifier.name === "-") {
            if (Array.isArray(parent.value)) {
              const index = parent.value.length;
              parent.value[index] = value;
            } else {
              this.Error(`Array item must indented inside of parent`, prop);
            }
          } else if (
            prop.identifier.name &&
            parent.value[prop.identifier.name] !== undefined
          ) {
            this.Error(
              `Duplicate identifier '${prop.identifier.name}'`,
              prop.identifier.debugMetadata
            );
          } else if (prop.identifier.name) {
            parent.value[prop.identifier.name] = value;
          }
        }
        parentStack.push({
          property: prop,
          value,
          currentPath: currentPropKey,
        });
      } else {
        const value = prop.GetValue();
        if (parent) {
          if (prop.identifier.name === "-") {
            if (Array.isArray(parent.value)) {
              const index = parent.value.length;
              parent.value[index] = value;
            } else {
              this.Error(`Array item must indented inside of parent`, prop);
            }
          } else if (
            prop.identifier.name &&
            parent.value[prop.identifier.name] !== undefined
          ) {
            this.Error(
              `Duplicate identifier '${prop.identifier.name}'`,
              prop.identifier.debugMetadata
            );
          } else if (prop.identifier.name) {
            parent.value[prop.identifier.name] = value;
          }
        }
      }
    }
    // console.log(parentStack[0]?.value);
    return parentStack[0]?.value;
  }
}
