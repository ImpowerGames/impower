export type ContainerType = "Construct" | "Block";

export type ItemType = "Trigger" | "Command" | "Variable" | "Element";

export type ConfigType = "Config";

export type StorageType = "Folder" | "File";

export type DataType = ContainerType | ItemType | ConfigType | StorageType;

export type ValueType =
  | "Unknown"
  | "Reference"
  | "Color"
  | "Vector2"
  | "Boolean"
  | "Number"
  | "String";

export type ItemSectionType = "Preview";

export type SetupSectionType = "Details" | "Configuration" | "Access";

export type SetupSettingsType =
  | "About"
  | "Branding"
  | "Page"
  | "Screenshots"
  | "Status"
  | "AdvancedSettings";
