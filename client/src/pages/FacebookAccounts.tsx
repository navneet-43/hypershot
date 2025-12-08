import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { FacebookAccount } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Facebook } from "lucide-react";
import LoginButton from "@/components/common/LoginButton";
import FacebookOAuthInstructions from "@/components/common/FacebookOAuthInstructions";

export default function FacebookAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "",
    pageId: "",
    accessToken: ""
  });
  
  // Check authentication status
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/status'],
    refetchOnWindowFocus: true
  });

  const isLoggedIn = (authStatus as any)?.isLoggedIn || false;
  const user = (authStatus as any)?.user;
  const hasFacebookToken = user?.facebookToken;


  const { data: accounts = [], isLoading } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000
  });

  const addAccountMutation = useMutation({
    mutationFn: (newAccount: Omit<FacebookAccount, 'id' | 'userId' | 'createdAt' | 'isActive'>) => {
      return apiRequest('/api/facebook-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/facebook-accounts'] });
      toast({
        title: "Account connected",
        description: "Your Facebook account has been successfully connected."
      });
      setIsAddDialogOpen(false);
      setNewAccount({ name: "", pageId: "", accessToken: "" });
    },
    onError: (error) => {
      toast({
        title: "Error connecting account",
        description: (error as Error).message || "There was an error connecting your Facebook account.",
        variant: "destructive"
      });
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/facebook-accounts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/facebook-accounts'] });
      toast({
        title: "Account removed",
        description: "The Facebook account has been successfully disconnected."
      });
    },
    onError: (error) => {
      toast({
        title: "Error removing account",
        description: (error as Error).message || "There was an error removing the Facebook account.",
        variant: "destructive"
      });
    }
  });

  const toggleAccountMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number, isActive: boolean }) => {
      return apiRequest(`/api/facebook-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/facebook-accounts'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating account",
        description: (error as Error).message || "There was an error updating the Facebook account status.",
        variant: "destructive"
      });
    }
  });

  const testFacebookMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/facebook-direct-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Facebook Test Successful",
        description: `Test post published successfully to ${data.accountName}. Post ID: ${data.facebookPostId}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Facebook Test Failed",
        description: error.message || "Failed to publish test post to Facebook",
        variant: "destructive"
      });
    }
  });

  const refreshPagesMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/facebook-accounts/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/facebook-accounts'] });
      toast({
        title: "Pages Refreshed",
        description: `Successfully synced: ${data.newPages} new, ${data.updatedPages} updated`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh Facebook pages",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addAccountMutation.mutate(newAccount);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewAccount(prev => ({ ...prev, [name]: value }));
  };

  return (
    <>
      <DashboardHeader 
        title="Facebook Accounts" 
        subtitle="Manage your connected Facebook pages" 
        importLabel={isLoggedIn ? "Connect Account Manually" : "Connect Account"}
        showImport={true}
        onImport={() => setIsAddDialogOpen(true)}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {!isLoggedIn && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Connect with Facebook</CardTitle>
                <CardDescription>
                  Login with Facebook to automatically connect your accessible pages
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="text-center max-w-md">
                  <Facebook className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                  <p className="mb-4">Connect your Facebook account to easily manage and schedule posts to your business pages.</p>
                  <div className="space-y-3">
                    <LoginButton size="lg" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <FacebookOAuthInstructions />
          </>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Manage your Facebook business accounts for automated posting
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-60 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Facebook className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                  <p>No Facebook accounts connected yet</p>
                  <p className="text-sm mt-2">Connect your Facebook account to get started</p>
                  {isLoggedIn ? (
                    <div className="mt-4 space-y-2">
                      {hasFacebookToken ? (
                        <>
                          <p className="text-sm">Your Facebook account is connected, but the tokens may need refreshing.</p>
                          <div className="flex gap-2 mt-2">
                            <Button 
                              variant="default"
                              onClick={() => window.location.href = '/auth/facebook'}
                            >
                              Refresh Facebook Connection
                            </Button>
                            <Button 
                              variant="outline"
                              onClick={() => refreshPagesMutation.mutate()}
                              disabled={refreshPagesMutation.isPending}
                            >
                              {refreshPagesMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Syncing...
                                </>
                              ) : (
                                'Sync Facebook Pages'
                              )}
                            </Button>
                            <Button 
                              variant="outline"
                              onClick={() => testFacebookMutation.mutate()}
                              disabled={testFacebookMutation.isPending}
                            >
                              {testFacebookMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Testing...
                                </>
                              ) : (
                                'Test Facebook Publishing'
                              )}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm">Connect your Facebook account to import your pages automatically.</p>
                          <Button 
                            variant="default" 
                            className="mt-2"
                            onClick={() => window.location.href = '/auth/facebook'}
                          >
                            Connect Facebook Account
                          </Button>
                          <p className="text-sm mt-4">or</p>
                          <Button 
                            variant="outline" 
                            className="mt-2"
                            onClick={() => setIsAddDialogOpen(true)}
                          >
                            Connect Account Manually
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <LoginButton />
                      <p className="text-sm mt-4">or</p>
                      <Button 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => setIsAddDialogOpen(true)}
                      >
                        Connect Account Manually
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((account: FacebookAccount) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Facebook className="h-6 w-6 text-blue-600" />
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-gray-500">Page ID: {account.pageId}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => testFacebookMutation.mutate()}
                        disabled={testFacebookMutation.isPending}
                      >
                        {testFacebookMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Testing...
                          </>
                        ) : (
                          'Test Publishing'
                        )}
                      </Button>
                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={account.isActive}
                          onCheckedChange={(checked) => 
                            toggleAccountMutation.mutate({ id: account.id, isActive: checked })
                          }
                        />
                        <span className={account.isActive ? "text-green-600" : "text-gray-500"}>
                          {account.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will disconnect this Facebook account and all scheduled posts for this account will be canceled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => deleteAccountMutation.mutate(account.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          {accounts.length > 0 && isLoggedIn && (
            <CardFooter>
              <Button 
                variant="outline"
                onClick={() => refreshPagesMutation.mutate()}
                disabled={refreshPagesMutation.isPending}
              >
                {refreshPagesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Syncing...
                  </>
                ) : (
                  'Sync New Facebook Pages'
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Add Account Dialog (Manual Connection) */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Facebook Account Manually</DialogTitle>
            <DialogDescription>
              Enter your Facebook page details to connect it to the application.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="My Business Page"
                  value={newAccount.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pageId">Page ID</Label>
                <Input
                  id="pageId"
                  name="pageId"
                  placeholder="1234567890"
                  value={newAccount.pageId}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  name="accessToken"
                  type="password"
                  placeholder="Facebook Page Access Token"
                  value={newAccount.accessToken}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={addAccountMutation.isPending}
              >
                {addAccountMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Connect Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
