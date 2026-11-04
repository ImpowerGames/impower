import { StructDefinition as RuntimeStructDefinition } from "../../../../../runtime/StructDefinition";
import { StructPropertyDefinition } from "./StructPropertyDefinition";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { VariableAssignment } from "../Variable/VariableAssignment";
import { Identifier } from "../Identifier";

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
    if (type) {
      value["$type"] = type;
    }
    if (name) {
      value["$name"] = name;
    }
    return new RuntimeStructDefinition(type, name, value);
  }

  constructor(public propertyDefinitions: StructPropertyDefinition[]) {
    super();
    this.AddContent(propertyDefinitions as any);
  }

  protected override Prepare(): boolean {
    throw new Error("Not implemented.");
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);
    context.CheckForNamingCollisions(this, this.identifier!, SymbolType.Struct);
  }

  BuildValue(propertyDefinitions: StructPropertyDefinition[]) {
    const value: Record<string, unknown> = {};
    const seen = new Set<string>();
    for (const prop of propertyDefinitions) {
      const name = prop.identifier?.name;
      if (!name) {
        continue;
      }
      if (seen.has(name)) {
        this.Error(
          `Duplicate identifier \`${name}\``,
          prop.identifier!.debugMetadata,
        );
        continue;
      }
      seen.add(name);
      const propValue = prop.GetValue();
      if (propValue !== undefined) {
        value[name] = propValue;
      }
    }
    return value;
  }
}
