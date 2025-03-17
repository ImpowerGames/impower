export interface VariablePresentationHint {
  /** The kind of variable. Before introducing additional values, try to use the listed values.
    Values: 
    'property': Indicates that the object is a property.
    'method': Indicates that the object is a method.
    'class': Indicates that the object is a class.
    'data': Indicates that the object is data.
    'event': Indicates that the object is an event.
    'baseClass': Indicates that the object is a base class.
    'innerClass': Indicates that the object is an inner class.
    'interface': Indicates that the object is an interface.
    'mostDerivedClass': Indicates that the object is the most derived class.
    'virtual': Indicates that the object is virtual, that means it is a synthetic object introduced by the adapter for rendering purposes, e.g. an index range for large arrays.
    'dataBreakpoint': Deprecated: Indicates that a data breakpoint is registered for the object. The `hasDataBreakpoint` attribute should generally be used instead.
    etc.
  */
  kind?:
    | "property"
    | "method"
    | "class"
    | "data"
    | "event"
    | "baseClass"
    | "innerClass"
    | "interface"
    | "mostDerivedClass"
    | "virtual"
    | "dataBreakpoint"
    | string;
  /** Set of attributes represented as an array of strings. Before introducing additional values, try to use the listed values.
    Values: 
    'static': Indicates that the object is static.
    'constant': Indicates that the object is a constant.
    'readOnly': Indicates that the object is read only.
    'rawString': Indicates that the object is a raw string.
    'hasObjectId': Indicates that the object can have an Object ID created for it. This is a vestigial attribute that is used by some clients; 'Object ID's are not specified in the protocol.
    'canHaveObjectId': Indicates that the object has an Object ID associated with it. This is a vestigial attribute that is used by some clients; 'Object ID's are not specified in the protocol.
    'hasSideEffects': Indicates that the evaluation had side effects.
    'hasDataBreakpoint': Indicates that the object has its value tracked by a data breakpoint.
    etc.
  */
  attributes?: (
    | "static"
    | "constant"
    | "readOnly"
    | "rawString"
    | "hasObjectId"
    | "canHaveObjectId"
    | "hasSideEffects"
    | "hasDataBreakpoint"
    | string
  )[];
  /** Visibility of variable. Before introducing additional values, try to use the listed values.
    Values: 'public', 'private', 'protected', 'internal', 'final', etc.
  */
  visibility?:
    | "public"
    | "private"
    | "protected"
    | "internal"
    | "final"
    | string;
  /** If true, clients can present the variable with a UI that supports a specific gesture to trigger its evaluation.
    This mechanism can be used for properties that require executing code when retrieving their value and where the code execution can be expensive and/or produce side-effects. A typical example are properties based on a getter function.
    Please note that in addition to the `lazy` flag, the variable's `variablesReference` is expected to refer to a variable that will provide the value through another `variable` request.
  */
  lazy?: boolean;
}

export interface Variable {
  scopePath?: string;
  /** The variable's name. */
  name: string;
  /** The variable's value.
    This can be a multi-line text, e.g. for a function the body of a function.
    For structured variables (which do not have a simple value), it is recommended to provide a one-line representation of the structured object. This helps to identify the structured object in the collapsed state when its children are not yet visible.
    An empty string can be used if no value should be shown in the UI.
  */
  value: string;
  /** The type of the variable's value. Typically shown in the UI when hovering over the value.
    This attribute should only be returned by a debug adapter if the corresponding capability `supportsVariableType` is true.
  */
  type?: string;
  /** Properties of a variable that can be used to determine how to render the variable in the UI. */
  presentationHint?: VariablePresentationHint;
  /** The evaluatable name of this variable which can be passed to the `evaluate` request to fetch the variable's value. */
  evaluateName?: string;
  /** If `variablesReference` is > 0, the variable is structured and its children can be retrieved by passing `variablesReference` to the `variables` request as long as execution remains suspended. See 'Lifetime of Object References' in the Overview section for details. */
  variablesReference: number;
  /** The number of named child variables.
    The client can use this information to present the children in a paged UI and fetch them in chunks.
  */
  namedVariables?: number;
  /** The number of indexed child variables.
    The client can use this information to present the children in a paged UI and fetch them in chunks.
  */
  indexedVariables?: number;
  /** A memory reference associated with this variable.
    For pointer type variables, this is generally a reference to the memory address contained in the pointer.
    For executable data, this reference may later be used in a `disassemble` request.
    This attribute may be returned by a debug adapter if corresponding capability `supportsMemoryReferences` is true.
  */
  memoryReference?: string;
  /** A reference that allows the client to request the location where the variable is declared. This should be present only if the adapter is likely to be able to resolve the location.
    
    This reference shares the same lifetime as the `variablesReference`. See 'Lifetime of Object References' in the Overview section for details.
  */
  declarationLocationReference?: number;
  /** A reference that allows the client to request the location where the variable's value is declared. For example, if the variable contains a function pointer, the adapter may be able to look up the function's location. This should be present only if the adapter is likely to be able to resolve the location.
    
    This reference shares the same lifetime as the `variablesReference`. See 'Lifetime of Object References' in the Overview section for details.
  */
  valueLocationReference?: number;
}
