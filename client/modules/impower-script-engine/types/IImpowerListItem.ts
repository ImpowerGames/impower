/**
 * An interface inherited by `ImpowerListItem`, defining exposed
 * properties. It's mainly used when deserializing a `ImpowerListItem` from its
 * key (`SerializedImpowerListItem`)
 */
export interface IImpowerListItem {
  readonly originName: string;
  readonly itemName: string;
}
