export interface FountainReference {
  from: number;
  to: number;
  name: string;

  // Only populated if reference resolves
  id?: string;
  declaration?: boolean;
}
