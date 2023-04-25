type SpMutationEvent = CustomEvent<{ mutationList: MutationRecord[] }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-mutation": SpMutationEvent;
  }
}

export default SpMutationEvent;
