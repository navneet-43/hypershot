import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { apiRequest } from "@/lib/queryClient";

export default function UserMenu() {
  const { user } = usePlatformAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/platform/auth/logout", {
        method: "POST",
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/auth/status"] });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: "Logout error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (!user) return null;

  const initials = user.fullName
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-500 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              @{user.username}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer">
          <i className="fa-solid fa-user mr-2 h-4 w-4"></i>
          Profile Settings
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          <i className="fa-solid fa-key mr-2 h-4 w-4"></i>
          Change Password
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem className="cursor-pointer">
            <i className="fa-solid fa-users mr-2 h-4 w-4"></i>
            Team Management
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-red-600 focus:text-red-600"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <i className="fa-solid fa-sign-out-alt mr-2 h-4 w-4"></i>
          {logoutMutation.isPending ? "Logging out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}