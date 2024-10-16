import { StructDefinition as RuntimeStructDefinition } from "../../../../engine/StructDefinition";
import { StructProperty } from "./StructProperty";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { VariableAssignment } from "../Variable/VariableAssignment";
import { Identifier } from "../Identifier";

export class StructDefinition extends ParsedObject {
  override get typeName() {
    return "Define";
  }

  public identifier: Identifier | null = null;

  public variableAssignment: VariableAssignment | null = null;

  get runtimeStructDefinition(): RuntimeStructDefinition {
    const id = this.identifier?.name || "";
    const value = this.BuildValue(this.propertyDefinitions);
    const [type, name] = id.split(".");
    value["$type"] = type;
    value["$name"] = name;
    return new RuntimeStructDefinition(id, value);
  }

  constructor(public propertyDefinitions: StructProperty[]) {
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

  BuildValue(propertyDefinitions: StructProperty[]) {
    let parentStack: { property: StructProperty | null; value: any }[] = [
      { property: null, value: {} },
    ];
    const firstProp = propertyDefinitions[0];
    if (firstProp && firstProp.index !== null) {
      // Is defining array struct
      parentStack[0]!.value = [];
    }
    for (let i = 0; i < propertyDefinitions.length; i += 1) {
      const prop = propertyDefinitions[i]!;
      const nextProp = propertyDefinitions[i + 1];
      while (
        prop.level <=
        (parentStack[parentStack.length - 1]?.property?.level ?? 0)
      ) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];
      if (
        typeof prop.value === "object" &&
        prop.value &&
        !("$name" in prop.value)
      ) {
        // If first child property is an array item, this property is an array
        const isArray =
          nextProp && nextProp.level > prop.level && nextProp.index !== null;
        const value = isArray ? [] : prop.value;
        if (parent) {
          if (parent.value[prop.identifier.name] === undefined) {
            if (
              Array.isArray(parent.value) &&
              Number.isNaN(Number(prop.identifier.name))
            ) {
              this.Error(
                `Property is not an array item (not prefixed with '-')`,
                prop
              );
            } else {
              parent.value[prop.identifier.name] = value;
            }
          } else {
            this.Error(
              `Duplicate identifier '${prop.identifier.name}'`,
              prop.identifier.debugMetadata
            );
          }
        }
        parentStack.push({ property: prop, value });
      } else {
        const value = prop.value;
        if (parent) {
          if (parent.value[prop.identifier.name] === undefined) {
            if (
              Array.isArray(parent.value) &&
              Number.isNaN(Number(prop.identifier.name))
            ) {
              this.Error(
                `Property is not an array item (not prefixed with '-')`,
                prop
              );
            } else {
              parent.value[prop.identifier.name] = value;
            }
          } else {
            this.Error(
              `Duplicate identifier '${prop.identifier.name}'`,
              prop.identifier.debugMetadata
            );
          }
        }
      }
    }
    return parentStack[0]?.value;
  }
}
