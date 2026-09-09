/**
 * The path this flow was first built at, kept alongside
 * `/api/auth/facebook/callback` so a `.env` holding either one works.
 *
 * Meta only redirects to a URI registered in the dashboard, so exactly one of
 * these is live for any given app — which one is a dashboard setting, not a
 * code decision.
 */
export { handleInstagramCallback as GET } from "@/lib/instagram-callback";
