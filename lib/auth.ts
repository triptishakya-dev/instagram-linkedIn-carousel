import { prisma } from "./db";

/**
 * Identity, with a placeholder body.
 *
 * The schema already carries the Auth.js models, but no provider is wired yet.
 * Every route reads the current user through this one function, so swapping in
 * a real session lookup is a change to this file and nothing else.
 */

const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL ?? "dev@localhost";

let cachedUserId: string | undefined;

export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { email: DEV_USER_EMAIL, name: "Local development" },
    select: { id: true },
  });

  cachedUserId = user.id;
  return user.id;
}

/** Test seam: forget the memoised id between cases. */
export function resetCurrentUser() {
  cachedUserId = undefined;
}
