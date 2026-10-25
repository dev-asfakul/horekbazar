// Phase F, D29 revised: the carousel is a stack of cards with no pause button.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTOPLAY_MS, HomeCarousel, SWIPE_PX, stackPos } from "@/components/home/HomeCarousel";

const labels = (n: number) => ({ label: "Offers", prev: "Previous slide", next: "Next slide", goTo: Array.from({ length: n }, (_, i) => `Slide ${i + 1}`), counter: Array.from({ length: n }, (_, i) => `${i + 1}/${n}`) });

describe("stack positions", () => {
  it("front, two behind, the rest hidden", () => {
    expect([0, 1, 2, 3, 4].map((i) => stackPos(i, 0, 5))).toEqual([0, 1, 2, 3, 3]);
  });
  it("wraps: the card just shown goes to the back", () => {
    expect([0, 1, 2, 3].map((i) => stackPos(i, 1, 4))).toEqual([3, 0, 1, 2]);
    expect([0, 1, 2].map((i) => stackPos(i, 2, 3))).toEqual([1, 2, 0]);
  });
  it("two slides: one behind", () => {
    expect([0, 1].map((i) => stackPos(i, 1, 2))).toEqual([1, 0]);
  });
  it("advances every 6 s; a swipe is 40 px or more", () => {
    expect(AUTOPLAY_MS).toBe(6000);
    expect(SWIPE_PX).toBe(40);
  });
});

describe("HomeCarousel markup", () => {
  it("renders nothing for no slides", () => {
    expect(renderToStaticMarkup(<HomeCarousel labels={labels(0)}>{[]}</HomeCarousel>)).toBe("");
  });
  it("one slide: no controls, nothing inert", () => {
    const html = renderToStaticMarkup(<HomeCarousel labels={labels(1)}>{[<p key="a">A</p>]}</HomeCarousel>);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).not.toContain("home-carousel-controls");
    expect(html).not.toContain("inert");
  });
  it("many slides: a stack with only the front card reachable; indicators, previous and next, no pause button", () => {
    const html = renderToStaticMarkup(
      <HomeCarousel labels={labels(3)}>
        {[<p key="a">A</p>, <p key="b">B</p>, <p key="c">C</p>]}
      </HomeCarousel>,
    );
    expect(html.match(/data-pos="(\d)"/g)).toEqual(['data-pos="0"', 'data-pos="1"', 'data-pos="2"']);
    expect(html.match(/inert=""/g)).toHaveLength(2);
    expect(html).not.toMatch(/Pause|Play|carousel-toggle/);
    expect(html.match(/home-carousel-dot"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Slide 1" aria-current="true"');
    expect(html).toContain('aria-label="Previous slide"');
    expect(html).toContain('data-autoplay="off"');
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(5);
  });
});
