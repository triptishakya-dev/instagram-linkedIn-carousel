/**
 * Mounted at the path `META_REDIRECT_URI` currently names.
 *
 * Named "facebook" for historical reasons — this is the Instagram Login flow,
 * not Facebook Login — and kept because the string is registered with Meta and
 * changing it there is a separate errand. The handler is shared with
 * `/api/auth/callback/instagram`, so whichever URI the dashboard holds, the
 * callback lands.
 */
export { handleInstagramCallback as GET } from "@/lib/instagram-callback";
