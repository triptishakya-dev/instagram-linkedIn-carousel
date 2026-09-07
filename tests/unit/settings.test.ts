import { describe, expect, it } from "vitest";
import { saveSettingsSchema } from "@/lib/validation/settings";

describe("workspace settings validation", () => {
  it("accepts a partial save of one section", () => {
    const parsed = saveSettingsSchema.parse({ budgetCap: 5_000_000 });
    expect(parsed.budgetCap).toBe(5_000_000);
    expect(parsed.settings).toBeUndefined();
  });

  it("keeps arbitrary preference keys, so the form can grow", () => {
    const parsed = saveSettingsSchema.parse({
      settings: { wsName: "Rubenius", igSlides: 8, notif: { failed: [true, true] } },
    });
    expect(parsed.settings).toMatchObject({ wsName: "Rubenius", igSlides: 8 });
  });

  it("rejects a payload big enough to bloat the row", () => {
    expect(() =>
      saveSettingsSchema.parse({ settings: { blob: "x".repeat(70_000) } }),
    ).toThrow();
  });

  it("rejects a team member without a usable email", () => {
    expect(() =>
      saveSettingsSchema.parse({ team: [{ name: "Sam", email: "not-an-email", role: "Viewer" }] }),
    ).toThrow();
  });

  it("rejects a save with nothing in it", () => {
    expect(() => saveSettingsSchema.parse({})).toThrow();
  });
});
