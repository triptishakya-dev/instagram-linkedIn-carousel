/**
 * Symmetric encryption for secrets that have to live in the database.
 *
 * A provider key stored on an `AiModel` row is readable by anything that can
 * read the row — a backup, a `psql` session, a logged query. It is encrypted
 * before it is written and decrypted only in the process that is about to make
 * the call, so the column is useless on its own.
 *
 * AES-256-GCM: the tag makes tampering a decryption failure rather than
 * silently different plaintext, which matters when the plaintext is about to
 * be sent to a paid API as an Authorization header.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Bumped only if the scheme changes, so old values stay readable. */
const VERSION = "v1";
const IV_BYTES = 12;

/**
 * The env var holds whatever the operator generated — 32 random bytes in
 * base64, or a passphrase. Either is stretched to a real 256-bit key here, so
 * a shorter secret is not silently truncated or zero-padded.
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();

  // Loud rather than convenient: falling back to a built-in key would store
  // secrets that anyone with the source can read, which is worse than not
  // storing them at all.
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set, so secrets cannot be encrypted. " +
        "Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`.",
    );
  }

  return Buffer.from(
    hkdfSync("sha256", raw, "insta-crossel/secret-at-rest", VERSION, 32),
  );
}

/** True when the process can encrypt and decrypt at all. */
export function canEncryptSecrets(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY?.trim();
}

/**
 * Encrypts a secret into a single self-describing string, safe to store in a
 * text column: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/**
 * Reverses `encryptSecret`.
 *
 * Throws on anything it cannot verify — a truncated value, a changed byte, a
 * value written under a different key. A caller that would rather carry on
 * without the secret should catch it; nothing here guesses.
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Encrypted value is not in the expected format.");
  }

  const [, iv, tag, ct] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
