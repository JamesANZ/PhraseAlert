import { describe, expect, it } from "vitest";
import { enforceVaguenessInvariant } from "./compiler";

describe("enforceVaguenessInvariant", () => {
  it("forces VAGUE when interpretations are present", () => {
    const result = enforceVaguenessInvariant({
      classification: "CLEAR",
      interpretations: ["Notify me when Bitcoin passes $100,000"],
      reasoning: "needs a threshold",
    });
    expect(result.classification).toBe("VAGUE");
    expect(result.interpretations).toEqual([
      "Notify me when Bitcoin passes $100,000",
    ]);
  });

  it("strips interpretations from CLEAR with none needed", () => {
    const result = enforceVaguenessInvariant({
      classification: "CLEAR",
      interpretations: [],
      reasoning: "specific enough",
    });
    expect(result.classification).toBe("CLEAR");
    expect(result.interpretations).toBeUndefined();
  });

  it("keeps VAGUE without interpretations for custom rewrite", () => {
    const result = enforceVaguenessInvariant({
      classification: "VAGUE",
      reasoning: "too broad",
    });
    expect(result.classification).toBe("VAGUE");
    expect(result.interpretations).toBeUndefined();
  });
});
