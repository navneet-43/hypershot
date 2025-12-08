import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(1, "Full name is required"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

interface PlatformLoginProps {
  onSuccess: () => void;
}

export default function PlatformLogin({ onSuccess }: PlatformLoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      fullName: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      return await apiRequest('/api/platform/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: (response: any) => {
      toast({
        title: "Login Successful",
        description: `Welcome back, ${response.user.fullName}!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/platform/auth/status'] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      return await apiRequest('/api/platform/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: (response: any) => {
      toast({
        title: "Registration Successful",
        description: `Welcome to HyperShot, ${response.user.fullName}!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/platform/auth/status'] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const handleRegister = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-xl mb-4">
            <i className="fa-solid fa-bolt-lightning text-2xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">HyperShot</h1>
          <p className="text-gray-600">Advanced Social Media Publishing Platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isRegistering ? "Create Account" : "Sign In"}</CardTitle>
            <CardDescription>
              {isRegistering 
                ? "Create your HyperShot account to get started" 
                : "Sign in to your HyperShot account"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isRegistering ? (
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    {...loginForm.register("username")}
                    placeholder="Enter your username"
                    disabled={loginMutation.isPending}
                  />
                  {loginForm.formState.errors.username && (
                    <p className="text-sm text-red-600">
                      {loginForm.formState.errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    {...loginForm.register("password")}
                    placeholder="Enter your password"
                    disabled={loginMutation.isPending}
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-red-600">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsRegistering(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                    disabled={loginMutation.isPending}
                  >
                    Don't have an account? Create one
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    {...registerForm.register("fullName")}
                    placeholder="Enter your full name"
                    disabled={registerMutation.isPending}
                  />
                  {registerForm.formState.errors.fullName && (
                    <p className="text-sm text-red-600">
                      {registerForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...registerForm.register("email")}
                    placeholder="Enter your email"
                    disabled={registerMutation.isPending}
                  />
                  {registerForm.formState.errors.email && (
                    <p className="text-sm text-red-600">
                      {registerForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    {...registerForm.register("username")}
                    placeholder="Choose a username"
                    disabled={registerMutation.isPending}
                  />
                  {registerForm.formState.errors.username && (
                    <p className="text-sm text-red-600">
                      {registerForm.formState.errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    {...registerForm.register("password")}
                    placeholder="Choose a password"
                    disabled={registerMutation.isPending}
                  />
                  {registerForm.formState.errors.password && (
                    <p className="text-sm text-red-600">
                      {registerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Creating account..." : "Create Account"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsRegistering(false)}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                    disabled={registerMutation.isPending}
                  >
                    Already have an account? Sign in
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Secure platform authentication for HyperShot</p>
        </div>
      </div>
    </div>
  );
}