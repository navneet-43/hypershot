import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { loginSchema, registerSchema } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

type LoginData = z.infer<typeof loginSchema>;
type RegisterData = z.infer<typeof registerSchema>;

export default function TeamLogin() {
  const [, navigate] = useLocation();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Login form state
  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
  });

  // Registration form state
  const [registerData, setRegisterData] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("/api/platform/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Welcome back!",
          description: "You've been successfully logged in.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/platform/auth/status"] });
        navigate("/");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest("/api/platform/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Account created!",
          description: "Welcome to HyperShot. You're now logged in.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/platform/auth/status"] });
        navigate("/");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = async () => {
    setFormErrors({});
    const result = loginSchema.safeParse(loginData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((error) => {
        errors[error.path[0] as string] = error.message;
      });
      setFormErrors(errors);
      return;
    }
    loginMutation.mutate(loginData);
  };

  const handleRegister = async () => {
    setFormErrors({});
    const result = registerSchema.safeParse(registerData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((error) => {
        errors[error.path[0] as string] = error.message;
      });
      setFormErrors(errors);
      return;
    }
    registerMutation.mutate(registerData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            {isLoginMode ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {isLoginMode 
              ? "Sign in to your HyperShot team account" 
              : "Join your team on HyperShot"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoginMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <Input
                  placeholder="Enter your username"
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  className="w-full"
                />
                {formErrors.username && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.username}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="w-full"
                />
                {formErrors.password && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.password}</p>
                )}
              </div>
              
              <Button 
                onClick={handleLogin}
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <Input
                  placeholder="Enter your full name"
                  value={registerData.fullName}
                  onChange={(e) => setRegisterData({ ...registerData, fullName: e.target.value })}
                  className="w-full"
                />
                {formErrors.fullName && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.fullName}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <Input
                  placeholder="Choose a username"
                  value={registerData.username}
                  onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                  className="w-full"
                />
                {formErrors.username && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.username}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  className="w-full"
                />
                {formErrors.email && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <Input
                  type="password"
                  placeholder="Create a password (min 6 characters)"
                  value={registerData.password}
                  onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                  className="w-full"
                />
                {formErrors.password && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.password}</p>
                )}
              </div>
              
              <Button 
                onClick={handleRegister}
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Creating account..." : "Create account"}
              </Button>
            </div>
          )}
          
          <div className="text-center pt-4 border-t mt-6">
            <p className="text-sm text-gray-600">
              {isLoginMode ? "Don't have an account?" : "Already have an account?"}
              <button
                onClick={() => setIsLoginMode(!isLoginMode)}
                className="ml-1 text-blue-600 hover:text-blue-800 font-medium"
              >
                {isLoginMode ? "Create a new account" : "Sign in here"}
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}