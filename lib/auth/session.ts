/**
 * @title Session helpers
 * @notice Thin wrappers around NextAuth `auth()` for API route user id enforcement.
 */
import { auth } from "@/lib/auth";

/**
 * @notice Require an authenticated session and return the user id.
 * @dev Throws "Unauthorized" — map to HTTP 401 in route catch blocks.
 * @return Session user id string.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

/**
 * @notice Return the current session user or null when logged out.
 */
export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}
