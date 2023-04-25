import type SpCarouselItem from "../components/carousel-item/carousel-item";

type SpSlideChange = CustomEvent<{ index: number; slide: SpCarouselItem }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "s-slide-change": SpSlideChange;
  }
}

export default SpSlideChange;
