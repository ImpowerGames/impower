export interface OutlineItem {
  children: OutlineItem[];
  addItem: (item: string) => void;
}
