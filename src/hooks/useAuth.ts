// src/hooks/useAuth.ts
/**
 * Convenience hook that exposes auth state and the logout action.
 *
 * Components should import from here rather than reading useAuthStore directly,
 * so the logout side-effects (navigation reset) stay co-located with the hook.
 */

import { logout as repoLogout } from "@features/auth/authRepository";
import type { User } from "@models/User";
import { useAuthStore } from "@store/authStore";

interface UseAuthReturn {
  user: User | null;
  isLoggedIn: boolean;
  isInitialised: boolean;
  /** Call this to log out from any screen. */
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const isInitialised = useAuthStore((s) => s.isInitialised);

  return {
    user,
    isLoggedIn: user !== null,
    isInitialised,
    logout: repoLogout,
  };
}
