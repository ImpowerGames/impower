export enum ContainerType {
  Construct = "Construct",
  Block = "Block",
}

export enum ItemType {
  Trigger = "Trigger",
  Command = "Command",
  Variable = "Variable",
  Element = "Element",
}

export enum ConfigType {
  Config = "Config",
}

export enum StorageType {
  Folder = "Folder",
  File = "File",
}

export type DataType = ContainerType | ItemType | ConfigType | StorageType;

export enum ValueType {
  Unknown = "Unknown",
  Reference = "Reference",
  Color = "Color",
  Vector2 = "Vector2",
  Boolean = "Boolean",
  Number = "Number",
  String = "String",
}

export enum ItemSectionType {
  Preview = "Preview",
}

export enum SetupSectionType {
  Details = "Details",
  Configuration = "Configuration",
  Access = "Access",
}

export enum SetupSettingsType {
  About = "About",
  Branding = "Branding",
  Page = "Page",
  Screenshots = "Screenshots",
  Status = "Status",
  AdvancedSettings = "AdvancedSettings",
}
