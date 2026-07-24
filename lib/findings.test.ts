import { describe, expect, it } from "vitest";
import {
  cleanDisplayText,
  isUsefulSnippet,
  softTruncate,
} from "@/lib/findings";

describe("findings display helpers", () => {
  it("softTruncates on sentence boundaries", () => {
    const text =
      "The US confirmed a 12.5% tariff on Australian exports. Extra detail follows here.";
    expect(softTruncate(text, 70)).toBe(
      "The US confirmed a 12.5% tariff on Australian exports.",
    );
  });

  it("rejects chrome-heavy snippets", () => {
    expect(
      isUsefulSnippet(
        "中文新闻 BERITA BAHASA INDONESIA Always light Always dark Follow system settings ABC iView",
      ),
    ).toBe(false);
  });

  it("accepts real article snippets", () => {
    expect(
      isUsefulSnippet(
        "Donald Trump has hit Australian exports with new trade tariffs, claiming the country is not doing enough to combat forced labour.",
      ),
    ).toBe(true);
  });

  it("strips markdown image chrome", () => {
    expect(
      cleanDisplayText(
        "**New search** ![Michael](https://example.com/x.jpg) Trump slapped a tariff",
      ),
    ).toBe("New search Trump slapped a tariff");
  });
});
