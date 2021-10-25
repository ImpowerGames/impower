export interface Inspector<T = Record<string, unknown>> {
  createData?: (data?: Partial<T>) => T;
  getName?: (data?: T) => string;
  validate?: (data: T) => T;
  isPropertyVisible?: (propertyPath: string, data: T) => boolean;
  isPropertyDisabled?: (
    _propertyPath: string,
    _data: T,
    _docIds?: string[]
  ) => boolean;
  isPropertyRequired?: (_propertyPath: string, _data: T) => boolean;
  isPropertyMultiline?: (_propertyPath: string, _data: T) => boolean;
  isPropertyMarkdown?: (_propertyPath: string, _data: T) => boolean;
  isPropertyDisplayValueInverted?: (_propertyPath: string, _data: T) => boolean;
  getPropertyMinRowCount?: (_propertyPath: string, _data: T) => number;
  getPropertyMaxRowCount?: (_propertyPath: string, _data: T) => number;
  isPropertyCollapsible?: (_propertyPath: string, _data: T) => boolean;
  isPropertyAutoFocused?: (_propertyPath: string, _data: T) => boolean;
  isListReorderingDisabled?: (_propertyPath: string, _data: T) => boolean;
  isListChangesDisabled?: (_propertyPath: string, _data: T) => boolean;
  isExternalFileAllowed?: (_propertyPath: string, _data: T) => boolean;
  isPropertyCharacterCounterVisible?: (
    _propertyPath: string,
    _data: T
  ) => boolean;
  getPropertyTooltip?: (_propertyPath: string, _data: T) => string;
  getPropertyError?: (
    propertyPath: string,
    data: T,
    value: unknown,
    _docIds: string[]
  ) => Promise<string | null>;
  getPropertyInputType?: (
    _propertyPath: string,
    _data?: T
  ) =>
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week";
  getPropertyOptions?: (_propertyPath: string, _data?: T) => unknown[];
  getPropertyOrder?: (_propertyPath: string, _data: T) => number;
  getPropertyIndent?: (_propertyPath: string, _data: T) => number;
  getPropertyDisplayValue?: (
    propertyPath: string,
    _data: T,
    value: unknown
  ) => string;
  getPropertyValueDescription?: (
    _propertyPath: string,
    _data: T,
    _value: unknown
  ) => string;
  getPropertyValueIcon?: (
    _propertyPath: string,
    _data: T,
    _value: unknown
  ) => string;
  getPropertyValueIconStyle?: (
    _propertyPath: string,
    _data: T,
    _value: unknown
  ) => { color?: string; fontSize?: string | number };
  getPropertyValueGroup?: (
    _propertyPath: string,
    _data: T,
    _value: unknown
  ) => string;
  getPropertyListCountLimit?: (_propertyPath: string, _data: T) => number;
  getPropertyCharacterCountLimit?: (_propertyPath: string, _data: T) => number;
  getPropertyHelperText?: (_propertyPath: string, _data: T) => string;
  getPropertyMoreInfoPopup?: (
    propertyPath: string,
    data: T
  ) => {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  };
  getPropertyBounds?: (
    _propertyPath: string,
    _data: T
  ) => {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  };
  getPropertyTextTransform?: (
    _propertyPath: string,
    _data: T
  ) => "uppercase" | "lowercase";
  getPropertyLabel?: (propertyPath: string, _data: T) => string;
  getPropertyPlaceholder?: (_propertyPath: string, _data: T) => string;
  getPropertyMoreIcon?: (_propertyPath: string, _data: T) => string;
  getPropertyMoreTooltip?: (_propertyPath: string, _data: T) => string;
  getPropertyMenuItems?: (
    _propertyPath: string,
    _data: T
  ) => { [type: string]: string };
  getPropertyDebounceInterval?: (_propertyPath: string, _data: T) => number;
  getPropertyDefaultValue?: (_propertyPath: string, _data: T) => unknown;
}
