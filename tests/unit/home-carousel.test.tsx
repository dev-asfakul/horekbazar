// Phase F: carousel stops and markup (0, 1 and many slides; controls rendered on the server).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTOPLAY_MS, HomeCarousel, nearest, stops } from "@/components/home/HomeCarousel";

const labels = (n: number) => ({ label: "Offers", prev: "Previous slide", next: "Next slide", pause: "Pause slides", play: "Play slides", goTo: Array.from({ length: n }, (_, i) => `Slide ${i + 1}`), counter: Array.from({ length: n }, (_, i) => `${i + 1}/${n}`), bengali: false });

describe("carousel stops", () => {
  it("one stop per slide when each needs scrolling to", () => {
    expect(stops([0, 310, 620, 930], 930)).toEqual([0, 310, 620, 930]);
  });
  it("slides past the end share the last reachable stop", () => {
    expect(stops([0, 420, 840, 1260], 560)).toEqual([0, 420, 560]);
  });
  it("everything fits: a single stop, nothing to move", () => {
    expect(stops([0, 420], 0)).toEqual([0]);
  });
  it("nearest stop", () => {
    expect(nearest([0, 420, 560], 500)).toBe(2);
    expect(nearest([0, 420, 560], 100)).toBe(0);
  });
  it("advances every 6 s", () => expect(AUTOPLAY_MS).toBe(6000));
});

describe("HomeCarousel markup", () => {
  it("renders nothing for no slides", () => {
    expect(renderToStaticMarkup(<HomeCarousel labels={labels(0)}>{[]}</HomeCarousel>)).toBe("");
  });
  it("one slide: no controls", () => {
    const html = renderToStaticMarkup(<HomeCarousel labels={labels(1)}>{[<p key="a">A</p>]}</HomeCarousel>);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).not.toContain("home-carousel-controls");
  });
  it("many slides: pause, indicators, previous and next rendered on the server, inactive until hydrated", () => {
    const html = renderToStaticMarkup(
      <HomeCarousel labels={labels(3)}>
        {[<p key="a">A</p>, <p key="b">B</p>, <p key="c">C</p>]}
      </HomeCarousel>,
    );
    expect(html).toContain('aria-label="Pause slides"');
    expect(html.match(/home-carousel-dot"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Slide 1" aria-current="true"');
    expect(html).toContain('aria-label="Previous slide"');
    expect(html).toContain('data-autoplay="off"');
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(6);
  });
});
