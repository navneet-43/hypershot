import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function DemoLoginButton() {
  const { toast } = useToast();

  const demoLogin = useMutation({
    mutationFn: () => {
      return apiRequest('POST', '/api/auth/demo-login', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/status'] });
      toast({
        title: "Demo Login Successful",
        description: "You are now logged in as a demo user.",
      });
      // Reload the page to refresh all authentication-dependent components
      window.location.reload();
    },
    onError: (error) => {
      toast({
        title: "Demo Login Failed",
        description: `Failed to login: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  const handleDemoLogin = () => {
    demoLogin.mutate();
  };

  return (
    <Button
      onClick={handleDemoLogin}
      disabled={demoLogin.isPending}
      variant="outline"
      className="w-full"
    >
      {demoLogin.isPending ? "Logging in..." : "Continue as Demo User"}
    </Button>
  );
}