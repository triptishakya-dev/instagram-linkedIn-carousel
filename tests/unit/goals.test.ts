import { describe, expect, it } from "vitest";
import { createGoalSchema, goalScheduleSchema } from "@/lib/validation/goal";

describe("Goal API Validation Schema Tests", () => {
  it("validates goal schedule schema", () => {
    const validSchedule = {
      cadence: "weekly",
      time: "10:30",
      weekdays: [1, 3, 5],
      monthDay: 1,
    };

    const parsed = goalScheduleSchema.parse(validSchedule);
    expect(parsed.cadence).toBe("WEEKLY");
    expect(parsed.time).toBe("10:30");
    expect(parsed.weekdays).toEqual([1, 3, 5]);
  });

  it("validates createGoalSchema input", () => {
    const validGoalInput = {
      name: "Weekly Tech Carousel",
      platforms: ["instagram", "linkedin"],
      captionPrompt: "Create informative posts about AI tech",
      imagePrompt: "Use dark background and sleek layout",
      startDate: "2026-09-01T00:00:00.000Z",
      schedule: {
        cadence: "daily",
        time: "09:00",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        monthDay: 1,
      },
      status: "active",
    };

    const parsed = createGoalSchema.parse(validGoalInput);
    expect(parsed.name).toBe("Weekly Tech Carousel");
    expect(parsed.platforms).toEqual(["INSTAGRAM", "LINKEDIN"]);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.schedule.cadence).toBe("DAILY");
  });

  it("rejects goal creation with empty name or missing platforms", () => {
    const invalidGoalInput = {
      name: "",
      platforms: [],
      startDate: "2026-09-01T00:00:00.000Z",
      schedule: {
        cadence: "weekly",
        time: "09:00",
        weekdays: [],
        monthDay: 1,
      },
    };

    expect(() => createGoalSchema.parse(invalidGoalInput)).toThrow();
  });
});
