import { describe, expect, it } from "vitest";
import {
  diversifyResultsByDomain,
  publishedDateFromUrl,
  toIsoDate,
  urlLooksHistorical,
} from "./index";

describe("diversifyResultsByDomain", () => {
  it("prevents one domain from consuming all early evaluation slots", () => {
    const ranked = [
      { url: "https://bbc.com/1" },
      { url: "https://bbc.com/2" },
      { url: "https://bbc.com/3" },
      { url: "https://bbc.com/4" },
      { url: "https://theguardian.com/result" },
      { url: "https://rnz.co.nz/result" },
    ];

    expect(
      diversifyResultsByDomain(ranked).map((result) => result.url),
    ).toEqual([
      "https://bbc.com/1",
      "https://bbc.com/2",
      "https://theguardian.com/result",
      "https://rnz.co.nz/result",
      "https://bbc.com/3",
      "https://bbc.com/4",
    ]);
  });

  it("preserves the original order when domains are already diverse", () => {
    const ranked = [
      { url: "https://bbc.com/result" },
      { url: "https://theguardian.com/result" },
      { url: "https://rnz.co.nz/result" },
    ];

    expect(diversifyResultsByDomain(ranked)).toEqual(ranked);
  });
});

describe("toIsoDate", () => {
  it("parses YYYY-MM-DD as UTC midnight", () => {
    expect(toIsoDate("2026-07-25")).toBe("2026-07-25T00:00:00.000Z");
  });

  it("parses RFC-style timestamps", () => {
    expect(toIsoDate("Sat, 25 Jul 2026 11:43:00 GMT")).toBe(
      "2026-07-25T11:43:00.000Z",
    );
  });

  it("falls back to retrievedAt when Tavily omits a date", () => {
    expect(toIsoDate(null, "2026-07-25T12:00:00.000Z")).toBe(
      "2026-07-25T12:00:00.000Z",
    );
    expect(toIsoDate(undefined, "2026-07-25T12:00:00.000Z")).toBe(
      "2026-07-25T12:00:00.000Z",
    );
  });

  it("returns null only when both date and fallback are missing", () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("not-a-date")).toBeNull();
  });
});

describe("publishedDateFromUrl", () => {
  it("reads /YYYY/MM/DD/ CMS paths", () => {
    expect(
      publishedDateFromUrl(
        "https://www.stuff.co.nz/national/2026/07/25/auckland-rain",
      ),
    ).toBe("2026-07-25T00:00:00.000Z");
  });

  it("returns null when the path has no date", () => {
    expect(
      publishedDateFromUrl(
        "https://www.metservice.com/towns-cities/regions/auckland/locations/auckland",
      ),
    ).toBeNull();
  });
});

describe("urlLooksHistorical", () => {
  const created = "2026-07-24T20:01:00+12:00";

  it("flags archive URLs whose only years predate the watch", () => {
    expect(
      urlLooksHistorical(
        "https://niwa.co.nz/sites/default/files/Climate_Summary_July_2022_Final-v3.pdf",
        created,
      ),
    ).toBe(true);
    expect(
      urlLooksHistorical(
        "https://niwa.co.nz/climate-and-weather/monthly/climate-summary-july-2025",
        created,
      ),
    ).toBe(true);
  });

  it("keeps URLs with the watch year or no year", () => {
    expect(
      urlLooksHistorical(
        "https://www.nzherald.co.nz/nz/metservice-severe-weather-warning-saturday-july-25th-2026/abc",
        created,
      ),
    ).toBe(false);
    expect(
      urlLooksHistorical(
        "https://www.metservice.com/towns-cities/regions/auckland/locations/auckland",
        created,
      ),
    ).toBe(false);
  });
});
