/**
 * Instagram API with Instagram Login.
 *
 * The other flavour — Instagram API with Facebook Login — is what this file
 * used to implement, and it is a genuinely different API rather than the same
 * one with different scope strings. Swapping only the scopes would fail: the
 * Facebook dialog does not recognise `instagram_business_*` at all. So all four
 * hosts change too:
 *
 *   authorize      www.instagram.com/oauth/authorize   (was www.facebook.com)
 *   code exchange  api.instagram.com/oauth/access_token
 *   long-lived     graph.instagram.com/access_token
 *   profile+publish graph.instagram.com                (was graph.facebook.com)
 *
 * Three consequences worth knowing before debugging a connection:
 *
 *   1. No Facebook Page is involved. Facebook Login reached Instagram accounts
 *      *through* the Pages a user administered, which is why the old code
 *      listed `/me/accounts` and dropped Pages with no linked account. Here the
 *      account that logs in *is* the account, so one login is one destination.
 *   2. The credentials are the Instagram app's, not the Facebook app's. They
 *      live under the Instagram use case in the dashboard and are usually a
 *      different pair from `META_APP_ID`/`META_APP_SECRET`.
 *   3. The token can actually be renewed. Facebook Login could not extend a
 *      long-lived user token without another visit to the dialog; Instagram
 *      Login exposes `ig_refresh_token`, so a connection checked inside its 60
 *      days can be kept alive indefinitely without the user doing anything.
 *
 * Deliberately free of Prisma and of `next/*`: everything here is a request and
 * a shape returned, so it can be tested with a mocked `fetch`.
 */

/** Everything Instagram needs from us, read once and validated together. */
export type InstagramConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  version: string;
};

/**
 * Permissions the connection asks for.
 *
 * Only two, and neither has a Facebook equivalent that would work here:
 * `instagram_business_basic` reads the professional account and its media, and
 * `instagram_business_content_publish` is what allows posting, which is the
 * reason this flow exists. The `pages_*` scopes the Facebook flow needed are
 * meaningless without a Page in the picture.
 */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

/**
 * A call to Instagram that failed, carrying Instagram's own sentence.
 *
 * The two hosts disagree about error shape: `graph.instagram.com` answers with
 * Graph's `{ error: { message } }`, while `api.instagram.com/oauth` answers with
 * `{ error_type, error_message }`. Both are read, because a connection that
 * fails at the token exchange is exactly when the message matters.
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly traceId?: string | null,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

/**
 * Reads the credentials, falling back to the `META_*` names.
 *
 * The fallback is deliberate rather than lazy: the dashboard shows an Instagram
 * App ID under the Instagram use case, and for some apps it is the same value
 * as the Facebook app id while for others it is not. Reading `INSTAGRAM_APP_ID`
 * first means setting it is enough when they differ, and changing nothing is
 * enough when they do not.
 */
/**
 * The first of these variables that actually holds something.
 *
 * Blank counts as unset, which `??` would not do: a `.env` carrying
 * `INSTAGRAM_APP_ID=` with nothing after it is how a half-finished edit looks,
 * and treating that empty string as a value would report the fallback as
 * missing while it sat right there in the file.
 */
function firstSet(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function instagramConfig(): InstagramConfig {
  const appId = firstSet("INSTAGRAM_APP_ID", "META_APP_ID");
  const appSecret = firstSet("INSTAGRAM_APP_SECRET", "META_APP_SECRET");
  const redirectUri = firstSet("INSTAGRAM_REDIRECT_URI", "META_REDIRECT_URI");
  const version = firstSet("INSTAGRAM_API_VERSION", "META_GRAPH_VERSION") ?? "v23.0";

  const missing = [
    ["INSTAGRAM_APP_ID (or META_APP_ID)", appId],
    ["INSTAGRAM_APP_SECRET (or META_APP_SECRET)", appSecret],
    ["INSTAGRAM_REDIRECT_URI (or META_REDIRECT_URI)", redirectUri],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new InstagramApiError(
      `Instagram is not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. ` +
        "Add them to .env and restart the dev server.",
    );
  }

  return {
    appId: appId as string,
    appSecret: appSecret as string,
    redirectUri: redirectUri as string,
    version,
  };
}

/**
 * Where the browser is sent to authorise.
 *
 * `www.instagram.com`, not `www.facebook.com`, and unversioned: the Instagram
 * login dialog carries no version segment even though the API it grants access
 * to does.
 */
export function authorizeUrl(
  state: string,
  config: InstagramConfig = instagramConfig(),
): string {
  const params = new URLSearchParams({
    // Omitting this is not the same as setting it to 0. Instagram defaults it
    // to 1 and forwards the browser to /oauth/authorize/third_party/ with
    // `enable_fb_login=1` — the Facebook consent path, which an app configured
    // for Instagram Login has nothing behind. An already-logged-in browser
    // skips the login step, lands straight on that page and is told "Sorry,
    // this page isn't available", with no indication of why.
    enable_fb_login: "0",
    // Makes the person confirm which account is authorising instead of silently
    // using whichever one the browser happens to be signed in to. Worth the
    // extra step: the wrong account here produces a connection that looks fine
    // and publishes to somebody else's feed.
    force_authentication: "1",
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: INSTAGRAM_SCOPES.join(","),
    response_type: "code",
    state,
  });

  return `https://www.instagram.com/oauth/authorize?${params}`;
}

/**
 * Parses a response from either host, normalising the two error shapes.
 *
 * `graph.instagram.com` uses Graph's `{ error: { message, fbtrace_id } }`.
 * `api.instagram.com/oauth` uses `{ error_type, error_message, code }`. Reading
 * only one of them would turn the other host's failures into "something went
 * wrong" — and the token exchange, which is the step most likely to fail on a
 * misconfigured app, is on the host with the second shape.
 */
async function readBody(res: Response, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (!res.ok) throw new InstagramApiError(`${what} failed: ${text.slice(0, 200)}`, res.status);
    throw new InstagramApiError(`${what} returned a response that is not JSON.`, res.status);
  }

  const graph = body.error as
    | { message?: string; error_user_msg?: string; fbtrace_id?: string }
    | undefined;

  const oauthMessage = typeof body.error_message === "string" ? body.error_message : null;

  if (!res.ok || graph || oauthMessage) {
    throw new InstagramApiError(
      graph?.error_user_msg ??
        graph?.message ??
        oauthMessage ??
        `${what} failed (${res.status}).`,
      res.status,
      graph?.fbtrace_id ?? null,
    );
  }

  return body;
}

/** A token as Instagram reports it. `expiresIn` is seconds. */
export type InstagramToken = { accessToken: string; expiresIn: number | null };

function readToken(body: Record<string, unknown>): InstagramToken {
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new InstagramApiError("Instagram did not return an access token.");
  }

  const expiresIn = body.expires_in;
  return {
    accessToken,
    expiresIn: typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : null,
  };
}

/**
 * Trades the `code` from the callback for a short-lived token.
 *
 * A POST with a form body, which is not a style choice: this endpoint requires
 * `application/x-www-form-urlencoded` and rejects the query-string form the
 * Facebook flow used. It also keeps the app secret out of a URL.
 *
 * `redirect_uri` is sent again and must match the one the dialog was opened
 * with character for character — Instagram compares the strings, so a trailing
 * slash is a failure here rather than at the dialog.
 */
export async function exchangeCode(
  code: string,
  config: InstagramConfig = instagramConfig(),
): Promise<InstagramToken> {
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      // Instagram appends a `#_` fragment to the code on some redirects, and
      // sends it back verbatim if it is not trimmed.
      code: code.replace(/#_$/, ""),
    }),
  });

  return readToken(await readBody(res, "Exchanging the Instagram login code"));
}

/**
 * Upgrades a short-lived token to the 60-day one that gets stored.
 *
 * The short-lived token lasts about an hour, which would expire long before any
 * scheduled post fired.
 */
export async function exchangeForLongLived(
  shortLived: string,
  config: InstagramConfig = instagramConfig(),
): Promise<InstagramToken> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: shortLived,
  });

  const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
  return readToken(await readBody(res, "Extending the Instagram access token"));
}

/**
 * Extends a long-lived token for another 60 days.
 *
 * The capability the Facebook flow did not have, and the reason the refresh
 * route can now genuinely keep a connection alive rather than only report on
 * it. Two conditions: the token must be at least 24 hours old, and it must not
 * have lapsed yet — a token allowed to expire cannot be recovered here and
 * needs the user to authorise again.
 *
 * Takes no config, and deliberately so: this endpoint authenticates with the
 * token alone. Accepting one would mean a stored token could not be renewed on
 * a deployment whose app id happened to be unset, for a call that never needed
 * it.
 */
export async function refreshLongLived(longLived: string): Promise<InstagramToken> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longLived,
  });

  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
  return readToken(await readBody(res, "Renewing the Instagram access token"));
}

/**
 * The connected professional account.
 *
 * One login is one account here, so this is both the `SocialAccount` identity
 * and its single `SocialTarget` — there is no Page layer to fan out over.
 */
export type InstagramProfile = {
  /**
   * The id publishing addresses.
   *
   * `/me` returns two: `id` is app-scoped, and `user_id` is the Instagram
   * professional account id that the media endpoints take. Both are requested
   * and `user_id` preferred, because addressing media with the app-scoped id
   * fails at publish time — long after the connection looked fine.
   */
  id: string;
  username: string | null;
  name: string | null;
  /** "BUSINESS" or "MEDIA_CREATOR"; anything else cannot publish. */
  accountType: string | null;
  avatarUrl: string | null;
};

export async function fetchProfile(
  accessToken: string,
  config: InstagramConfig = instagramConfig(),
): Promise<InstagramProfile> {
  const fields = "id,user_id,username,name,account_type,profile_picture_url";

  // Bearer header rather than an `access_token` query param, so the token does
  // not end up in a URL that something along the way logs.
  const res = await fetch(`https://graph.instagram.com/${config.version}/me?fields=${fields}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const body = await readBody(res, "Reading the Instagram profile");

  const publishId =
    typeof body.user_id === "string" || typeof body.user_id === "number"
      ? String(body.user_id)
      : typeof body.id === "string"
        ? body.id
        : null;

  if (!publishId) {
    throw new InstagramApiError("Instagram did not identify the authorised account.");
  }

  return {
    id: publishId,
    username: typeof body.username === "string" ? body.username : null,
    name: typeof body.name === "string" ? body.name : null,
    accountType: typeof body.account_type === "string" ? body.account_type : null,
    avatarUrl:
      typeof body.profile_picture_url === "string" ? body.profile_picture_url : null,
  };
}

/**
 * Whether this account can be published to at all.
 *
 * A personal account can complete the login and still be unable to post, and
 * finding that out at publish time means a scheduled post fails silently at
 * 09:30. Checked at connect time instead, so the Accounts page can say what is
 * wrong while someone is looking at it.
 *
 * Unknown is treated as publishable: Instagram has renamed these values before,
 * and refusing a working account because the string is unfamiliar is the worse
 * failure of the two.
 */
export function canPublish(profile: InstagramProfile): boolean {
  if (!profile.accountType) return true;
  return profile.accountType !== "PERSONAL";
}

/** When a token with `expiresIn` seconds left stops working, or null. */
export function expiryFrom(token: InstagramToken, now: number = Date.now()): Date | null {
  return token.expiresIn === null ? null : new Date(now + token.expiresIn * 1000);
}
