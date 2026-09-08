import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canEncryptSecrets, decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY = "dGVzdC1rZXktbm90LXRoZS1yZWFsLW9uZS0zMi1ieXRlcw==";

describe("secret encryption", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips a provider key", () => {
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("never stores the plaintext in the blob", () => {
    const blob = encryptSecret("sk-supersecret-value");
    expect(blob).not.toContain("supersecret");
    expect(blob.startsWith("v1.")).toBe(true);
  });

  it("produces a different blob every time, so equal keys are not detectable", () => {
    expect(encryptSecret("same-key")).not.toBe(encryptSecret("same-key"));
  });

  it("refuses a tampered ciphertext rather than returning wrong bytes", () => {
    const parts = encryptSecret("sk-original").split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("refuses a value written under a different key", () => {
    const blob = encryptSecret("sk-original");
    process.env.TOKEN_ENCRYPTION_KEY = "a-completely-different-passphrase";
    expect(() => decryptSecret(blob)).toThrow();
  });

  it("refuses a malformed value", () => {
    expect(() => decryptSecret("not-encrypted-at-all")).toThrow(/expected format/);
    expect(() => decryptSecret("v2.a.b.c")).toThrow(/expected format/);
  });

  it("fails loudly when no encryption key is configured", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(canEncryptSecrets()).toBe(false);
    expect(() => encryptSecret("sk-x")).toThrow(/TOKEN_ENCRYPTION_KEY is not set/);
  });

  it("treats a blank key as absent", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "   ";
    expect(canEncryptSecrets()).toBe(false);
  });
});
