// Match event type name strings that are registered on GlobalEventHandlersEventMap...
export type EventTypeRequiresDetail<T> =
  T extends keyof GlobalEventHandlersEventMap
    ? // ...where the event detail is an object...
      GlobalEventHandlersEventMap[T] extends CustomEvent<
        Record<PropertyKey, unknown>
      >
      ? // ...that is non-empty...
        GlobalEventHandlersEventMap[T] extends CustomEvent<
          Record<PropertyKey, never>
        >
        ? never
        : // ...and has at least one non-optional property
        Partial<
            GlobalEventHandlersEventMap[T]["detail"]
          > extends GlobalEventHandlersEventMap[T]["detail"]
        ? never
        : T
      : never
    : never;

// The inverse of the above (match any type that doesn't match EventTypeRequiresDetail)
export type EventTypeDoesNotRequireDetail<T> =
  T extends keyof GlobalEventHandlersEventMap
    ? GlobalEventHandlersEventMap[T] extends CustomEvent<
        Record<PropertyKey, unknown>
      >
      ? GlobalEventHandlersEventMap[T] extends CustomEvent<
          Record<PropertyKey, never>
        >
        ? T
        : Partial<
            GlobalEventHandlersEventMap[T]["detail"]
          > extends GlobalEventHandlersEventMap[T]["detail"]
        ? T
        : never
      : T
    : T;

// `keyof EventTypesWithRequiredDetail` lists all registered event types that require detail
export type EventTypesWithRequiredDetail = {
  [EventType in keyof GlobalEventHandlersEventMap as EventTypeRequiresDetail<EventType>]: true;
};

// `keyof EventTypesWithoutRequiredDetail` lists all registered event types that do NOT require detail
export type EventTypesWithoutRequiredDetail = {
  [EventType in keyof GlobalEventHandlersEventMap as EventTypeDoesNotRequireDetail<EventType>]: true;
};

// Helper to make a specific property of an object non-optional
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// Given an event name string, get a valid type for the options to initialize the event that is more restrictive than
// just CustomEventInit when appropriate (validate the type of the event detail, and require it to be provided if the
// event requires it)
export type SpEventInit<T> = T extends keyof GlobalEventHandlersEventMap
  ? GlobalEventHandlersEventMap[T] extends CustomEvent<
      Record<PropertyKey, unknown>
    >
    ? GlobalEventHandlersEventMap[T] extends CustomEvent<
        Record<PropertyKey, never>
      >
      ? CustomEventInit<GlobalEventHandlersEventMap[T]["detail"]>
      : Partial<
          GlobalEventHandlersEventMap[T]["detail"]
        > extends GlobalEventHandlersEventMap[T]["detail"]
      ? CustomEventInit<GlobalEventHandlersEventMap[T]["detail"]>
      : WithRequired<
          CustomEventInit<GlobalEventHandlersEventMap[T]["detail"]>,
          "detail"
        >
    : CustomEventInit
  : CustomEventInit;

// Given an event name string, get the type of the event
export type GetCustomEventType<T> = T extends keyof GlobalEventHandlersEventMap
  ? GlobalEventHandlersEventMap[T] extends CustomEvent<unknown>
    ? GlobalEventHandlersEventMap[T]
    : CustomEvent<unknown>
  : CustomEvent<unknown>;

// `keyof ValidEventTypeMap` is equivalent to `keyof GlobalEventHandlersEventMap` but gives a nicer error message
export type ValidEventTypeMap =
  | EventTypesWithRequiredDetail
  | EventTypesWithoutRequiredDetail;
