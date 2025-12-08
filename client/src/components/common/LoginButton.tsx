import { Button } from "@/components/ui/button";
import { SiFacebook } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";

type LoginButtonProps = {
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost" | "link";
};

export default function LoginButton({ 
  size = "default", 
  variant = "default" 
}: LoginButtonProps) {
  // Check if user is already logged in
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/status'],
    refetchOnWindowFocus: true
  });

  const isLoggedIn = authStatus?.isLoggedIn;
  
  const handleLogout = async () => {
    // Call logout endpoint
    await fetch('/api/auth/logout');
    // Refresh the page to reset the auth state
    window.location.href = '/';
  };
  
  if (isLoggedIn) {
    return (
      <Button 
        size={size} 
        variant="outline" 
        onClick={handleLogout}
      >
        Logout
      </Button>
    );
  }
  
  return (
    <Button 
      size={size} 
      variant={variant}
      onClick={() => window.location.href = '/auth/facebook'}
      className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#0C63D4]"
    >
      <SiFacebook className="w-4 h-4" />
      <span>Login with Facebook</span>
    </Button>
  );
}