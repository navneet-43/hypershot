import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Ghost, ExternalLink, AlertCircle, Settings, CheckCircle2 } from "lucide-react";

interface SnapchatAccount {
  id: number;
  platformUserId: number;
  displayName: string;
  externalId: string;
  profileId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  profilePictureUrl?: string;
  isActive: boolean;
}

interface ConfigStatus {
  configured: boolean;
  message: string;
}

export default function SnapchatAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);

  const { data: configStatus } = useQuery<ConfigStatus>({
    queryKey: ['/api/snapchat/config-status'],
    staleTime: 60000
  });

  const { data: accounts = [], isLoading } = useQuery<SnapchatAccount[]>({
    queryKey: ['/api/snapchat-accounts'],
    staleTime: 60000
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/auth/snapchat', { 
        method: 'GET',
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.notConfigured) {
        toast({
          title: "Snapchat Not Configured",
          description: "Please configure Snapchat API credentials first.",
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      const errorData = error?.message ? JSON.parse(error.message.replace(/^[^{]*/, '')) : null;
      if (errorData?.notConfigured) {
        toast({
          title: "Snapchat API Not Configured",
          description: "Please add SNAPCHAT_CLIENT_ID and SNAPCHAT_CLIENT_SECRET to enable Snapchat integration.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Connection Failed",
          description: (error as Error).message || "Failed to initiate Snapchat connection.",
          variant: "destructive"
        });
      }
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/snapchat-accounts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/snapchat-accounts'] });
      toast({
        title: "Account Removed",
        description: "Snapchat account disconnected successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to remove Snapchat account.",
        variant: "destructive"
      });
    }
  });

  const handleConnect = () => {
    if (!configStatus?.configured) {
      toast({
        title: "Snapchat API Not Configured",
        description: "Please contact your administrator to configure Snapchat API credentials.",
        variant: "destructive"
      });
      return;
    }
    connectMutation.mutate();
  };

  const isConfigured = configStatus?.configured ?? false;

  return (
    <>
      <DashboardHeader 
        title="Snapchat Accounts" 
        subtitle="Manage your connected Snapchat accounts for publishing" 
        importLabel="Connect Snapchat"
        showImport={isConfigured}
        onImport={() => setIsConnectDialogOpen(true)}
      />
      
      <main className="container mx-auto px-4 py-8">

        {/* Configuration Status Card */}
        <Card className={`mb-6 ${isConfigured ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {isConfigured ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <Settings className="w-5 h-5 text-red-600 mt-0.5" />
              )}
              <div>
                <h3 className={`font-semibold ${isConfigured ? 'text-green-800' : 'text-red-800'}`}>
                  {isConfigured ? 'Snapchat API Configured' : 'Snapchat API Not Configured'}
                </h3>
                <p className={`text-sm mt-1 ${isConfigured ? 'text-green-700' : 'text-red-700'}`}>
                  {isConfigured 
                    ? 'Snapchat API credentials are set up. You can now connect your Snapchat accounts.'
                    : 'Snapchat API credentials are missing. The following environment variables are required:'}
                </p>
                {!isConfigured && (
                  <ul className="text-sm text-red-700 mt-2 list-disc ml-4 space-y-1">
                    <li><code className="bg-red-100 px-1 rounded">SNAPCHAT_CLIENT_ID</code></li>
                    <li><code className="bg-red-100 px-1 rounded">SNAPCHAT_CLIENT_SECRET</code></li>
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Access Notice */}
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-800">Snapchat API Access Requirements</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  To enable Snapchat publishing, you need to complete these steps:
                </p>
                <ol className="text-sm text-yellow-700 mt-2 list-decimal ml-4 space-y-1">
                  <li>Create a Snapchat Business Account at <a href="https://business.snapchat.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">business.snapchat.com</a></li>
                  <li>Set up a Public Profile in the Snapchat app</li>
                  <li>Register as a Developer at <a href="https://developers.snap.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">developers.snap.com</a></li>
                  <li>Create an OAuth 2.0 app and obtain Client ID and Secret</li>
                  <li>Request API allowlist access by contacting Snapchat</li>
                  <li>Add the credentials to your environment variables</li>
                </ol>
                <a 
                  href="https://developers.snap.com/api/marketing-api/Public-Profile-API/GetStarted" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-yellow-800 underline mt-3 font-medium"
                >
                  View Snapchat API Documentation <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
          </div>
        ) : accounts.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Ghost className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-700">No Snapchat Accounts Connected</h3>
              <p className="text-gray-500 mt-2 mb-6">
                {isConfigured 
                  ? 'Connect your Snapchat account to start publishing Stories and Spotlights'
                  : 'Configure Snapchat API credentials to enable account connections'}
              </p>
              {isConfigured && (
                <Button 
                  onClick={() => setIsConnectDialogOpen(true)}
                  className="bg-yellow-400 hover:bg-yellow-500 text-black"
                >
                  <Ghost className="w-4 h-4 mr-2" />
                  Connect Your First Account
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map((account) => (
              <Card key={account.id} className="relative" data-testid={`card-snapchat-account-${account.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center">
                      {account.profilePictureUrl ? (
                        <img 
                          src={account.profilePictureUrl} 
                          alt={account.displayName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <Ghost className="w-6 h-6 text-black" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{account.displayName}</CardTitle>
                      <CardDescription>Snapchat Account</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Profile ID</span>
                      <span className="text-gray-700 font-mono text-xs">{account.profileId.substring(0, 12)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className={`font-medium ${account.isActive ? 'text-green-600' : 'text-red-600'}`}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full text-red-600 border-red-200 hover:bg-red-50"
                        data-testid={`button-delete-snapchat-${account.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Snapchat Account?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {account.displayName} from your connected accounts. 
                          You can reconnect it at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAccountMutation.mutate(account.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Connect Dialog */}
        <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Snapchat Account</DialogTitle>
              <DialogDescription>
                {isConfigured 
                  ? "You'll be redirected to Snapchat to authorize this application. Make sure you have a Snapchat Public Profile set up."
                  : "Snapchat API credentials are not configured. Please contact your administrator."}
              </DialogDescription>
            </DialogHeader>
            {isConfigured ? (
              <>
                <div className="py-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-800 mb-2">Requirements</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Snapchat Business/Creator account</li>
                      <li>• Public Profile enabled</li>
                      <li>• API access approved by Snapchat</li>
                    </ul>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsConnectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConnect}
                    disabled={connectMutation.isPending}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Ghost className="w-4 h-4 mr-2" />
                        Connect with Snapchat
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="py-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-semibold text-red-800 mb-2">Configuration Required</h4>
                    <p className="text-sm text-red-700 mb-2">
                      The following environment variables must be set:
                    </p>
                    <ul className="text-sm text-red-700 space-y-1 font-mono">
                      <li>• SNAPCHAT_CLIENT_ID</li>
                      <li>• SNAPCHAT_CLIENT_SECRET</li>
                    </ul>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsConnectDialogOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
