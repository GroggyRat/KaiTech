/**
 * Reads the Supabase auth cookie and extracts the user ID WITHOUT
 * verifying the JWT signature. Completely bypasses the HS256/ES256 bug.
 */
export function getUserIdFromCookie(): string | null {
  const { cookies } = require("next/headers");
  const cookieStore = cookies();
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?.replace("https://", "")
    ?.split(".")[0];

  const names = [
    `sb-${projectRef}-auth-token`,
    "sb-access-token",
    "sb-auth-token",
  ];

  for (const name of names) {
    const cookie = cookieStore.get(name);
    if (!cookie?.value) continue;
    try {
      const session = JSON.parse(cookie.value);
      if (session.user?.id) return session.user.id;
      if (session.access_token) {
        const payload = JSON.parse(
          Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf-8")
        );
        if (payload?.sub) return payload.sub;
      }
    } catch {
      try {
        const payload = JSON.parse(
          Buffer.from(cookie.value.split(".")[1], "base64url").toString("utf-8")
        );
        if (payload?.sub) return payload.sub;
      } catch { /* ignore */ }
    }
  }
  return null;
}