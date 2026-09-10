/**
 * The Instagram OAuth callback, mounted at the path `INSTAGRAM_REDIRECT_URI`
 * (or `META_REDIRECT_URI`) names.
 *
 * Named "facebook" for historical reasons — this is the Instagram Login flow,
 * not Facebook Login — and kept because the string is what gets registered
 * under *Business login settings* in the dashboard. Meta only redirects to a
 * URI registered there, so renaming this directory means editing the dashboard
 * in the same change or the callback stops landing.
 *
 * A second mount at `/api/auth/callback/instagram` used to exist so either
 * spelling worked. It was removed: two live paths meant a redirect URI that
 * disagreed with the dashboard still returned 200 from one of them, which hid
 * exactly the misconfiguration it was supposed to tolerate.
 *
 * The handler itself is in `lib/instagram-callback.ts`, free of `next/*` route
 * plumbing so it can be tested directly.
 */

export { handleInstagramCallback as GET } from "@/lib/instagram-callback";
