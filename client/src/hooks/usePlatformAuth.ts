import { useQuery } from "@tanstack/react-query";

interface PlatformUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthStatus {
  isAuthenticated: boolean;
  user: PlatformUser | null;
}

export function usePlatformAuth() {
  const { data, isLoading } = useQuery<AuthStatus>({
    queryKey: ["/api/platform/auth/status"],
    retry: false,
  });

  return {
    user: data?.user || null,
    isLoading,
    isAuthenticated: data?.isAuthenticated || false,
  };
}