
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  apiRequest,
  type AuthResponse,
  type User,
} from "../lib/api";

interface RegisterData {
  fullName: string;
  email: string;
  organizationName: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(
  null
);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
  // loading starts as true on initial app load.
  // Background session checks should preserve the current page.
  try {
    const data = await apiRequest<{ user: User }>(
      "/auth/me",
      { cache: "no-store" }
    );

    setUser(data.user);
  } catch {
    setUser(null);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    void refreshSession();

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void refreshSession();
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    }

    window.addEventListener("pageshow", handlePageShow);

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        "pageshow",
        handlePageShow
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiRequest<AuthResponse>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      );

      setUser(data.user);
    },
    []
  );

  const googleLogin = useCallback(
    async (credential: string) => {
      const data = await apiRequest<AuthResponse>(
        "/auth/google",
        {
          method: "POST",
          body: JSON.stringify({ credential }),
        }
      );

      setUser(data.user);
    },
    []
  );

  const register = useCallback(
    async (input: RegisterData) => {
      const data = await apiRequest<AuthResponse>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );

      setUser(data.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiRequest("/auth/logout", {
      method: "POST",
    });

    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        googleLogin,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}
