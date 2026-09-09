import { describe, expect, it } from "vitest";
import { DAY, absDT, absDTS, relDT } from "@/lib/reds/format";

/**
 * Local time throughout, because that is what these render: a viewer reading a
 * timestamp wants their own clock, not UTC. Constructed with the local Date
 * constructor so the expectations hold whatever zone the suite runs in.
 */
const at = (h: number, m: number, s: number) => new Date(2026, 8, 9, h, m, s).toISOString();

describe("absDTS", () => {
  it("carries the seconds absDT drops", () => {
    expect(absDT(at(14, 32, 7))).toBe("9 Sep, 14:32");
    expect(absDTS(at(14, 32, 7))).toBe("9 Sep, 14:32:07");
  });

  it("pads every field, so a column of them lines up", () => {
    expect(absDTS(at(9, 5, 3))).toBe("9 Sep, 09:05:03");
  });

  it("names the year only when it is not the current one", () => {
    const now = new Date(2026, 8, 9, 12, 0, 0).getTime();

    expect(absDTS(at(14, 32, 7), now)).toBe("9 Sep, 14:32:07");
    expect(absDTS(new Date(2025, 8, 9, 14, 32, 7).toISOString(), now)).toBe(
      "9 Sep 2025, 14:32:07",
    );
  });

  it("reads as absent, not as the epoch, when there is no timestamp", () => {
    expect(absDTS(null)).toBe("—");
    expect(absDTS(undefined)).toBe("—");
  });
});

describe("relDT", () => {
  const now = new Date(2026, 8, 9, 12, 0, 0).getTime();
  const ago = (ms: number) => relDT(new Date(now - ms).toISOString(), now);

  it("distinguishes minutes, which it used to round away", () => {
    // The reported bug: everything under ninety minutes read "an hour ago", so
    // a post finished four minutes ago and one finished an hour ago matched.
    expect(ago(4 * 60_000)).toBe("4 minutes ago");
    expect(ago(60 * 60_000)).toBe("1 hour ago");
    expect(ago(4 * 60_000)).not.toBe(ago(60 * 60_000));
  });

  it("counts seconds once there is a number worth naming", () => {
    expect(ago(2_000)).toBe("just now");
    expect(ago(12_000)).toBe("12 seconds ago");
    expect(ago(59_000)).toBe("59 seconds ago");
  });

  it("agrees with itself on singulars", () => {
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(DAY)).toBe("1 day ago");
    expect(ago(3 * DAY)).toBe("3 days ago");
  });

  it("faces forward for something scheduled", () => {
    expect(relDT(new Date(now + 3 * 3600_000).toISOString(), now)).toBe("in 3 hours");
    expect(relDT(new Date(now + 90_000).toISOString(), now)).toBe("in 2 minutes");
  });

  it("stays empty for a missing timestamp, so nothing renders", () => {
    expect(relDT(null, now)).toBe("");
  });
});
