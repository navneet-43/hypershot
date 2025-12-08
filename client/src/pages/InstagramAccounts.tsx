import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Instagram, Send, Video, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";

interface InstagramAccount {
  id: number;
  userId: number;
  username: string;
  businessAccountId: string;
  connectedPageId: string;
  accessToken: string;
  profilePictureUrl?: string;
  followersCount?: number;
  isActive: boolean;
}

export default function InstagramAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [isTestPostDialogOpen, setIsTestPostDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null);
  const [testCaption, setTestCaption] = useState("");
  const [testImageUrl, setTestImageUrl] = useState("");
  const [testPostType, setTestPostType] = useState<"post" | "reel">("post");

  // Check authentication status
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/status'],
    refetchOnWindowFocus: true
  });

  const isLoggedIn = (authStatus as any)?.isLoggedIn || false;

  const { data: accounts = [], isLoading } = useQuery<InstagramAccount[]>({
    queryKey: ['/api/instagram-accounts'],
    staleTime: 60000
  });

  const connectAccountMutation = useMutation({
    mutationFn: (pageAccessToken: string) => {
      return apiRequest('/api/instagram-accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken })
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
      toast({
        title: "Instagram Connected",
        description: data.message || "Successfully connected Instagram Business account(s)."
      });
      setIsConnectDialogOpen(false);
      setPageAccessToken("");
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect Instagram account. Make sure you have an Instagram Business account linked to your Facebook Page.",
        variant: "destructive"
      });
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/instagram-accounts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
      toast({
        title: "Account Removed",
        description: "Instagram account disconnected successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to remove Instagram account.",
        variant: "destructive"
      });
    }
  });

  const toggleAccountMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number, isActive: boolean }) => {
      return apiRequest(`/api/instagram-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: (error as Error).message || "Failed to update account status.",
        variant: "destructive"
      });
    }
  });

  const testPostMutation = useMutation({
    mutationFn: ({ accountId, caption, imageUrl, postType }: { accountId: number, caption: string, imageUrl?: string, postType: "post" | "reel" }) => {
      const endpoint = postType === 'reel' ? '/api/instagram/publish-reel' : '/api/instagram/publish';
      const body = postType === 'reel' 
        ? { accountId, caption, videoUrl: imageUrl }
        : { accountId, caption, imageUrl, mediaType: imageUrl ? 'IMAGE' : undefined };
      
      return apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    },
    onSuccess: (data: any) => {
      const postTypeName = testPostType === 'reel' ? 'Reel' : 'Post';
      toast({
        title: `${postTypeName} Published!`,
        description: data.success 
          ? `Successfully published test ${postTypeName.toLowerCase()} to @${selectedAccount?.username}` 
          : `${postTypeName} failed to publish`,
        variant: data.success ? "default" : "destructive"
      });
      setIsTestPostDialogOpen(false);
      setTestCaption("");
      setTestImageUrl("");
      setTestPostType("post");
      setSelectedAccount(null);
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
    onError: (error) => {
      toast({
        title: "Publish Failed",
        description: (error as Error).message || "Failed to publish test post to Instagram.",
        variant: "destructive"
      });
    }
  });

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageAccessToken.trim()) {
      toast({
        title: "Token Required",
        description: "Please enter a Facebook Page access token.",
        variant: "destructive"
      });
      return;
    }
    connectAccountMutation.mutate(pageAccessToken);
  };

  const handleTestPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    
    if (!testImageUrl.trim()) {
      const mediaType = testPostType === 'reel' ? 'video' : 'image or video';
      toast({
        title: `${testPostType === 'reel' ? 'Video' : 'Media'} Required`,
        description: `Instagram ${testPostType === 'reel' ? 'Reels require a video' : 'requires an image or video'} URL. Caption-only posts are not supported.`,
        variant: "destructive"
      });
      return;
    }

    testPostMutation.mutate({
      accountId: selectedAccount.id,
      caption: testCaption.trim() || `Test ${testPostType} from HyperShot ${testPostType === 'reel' ? '🎬' : '📸'}`,
      imageUrl: testImageUrl.trim(),
      postType: testPostType
    });
  };

  const openTestPostDialog = (account: InstagramAccount) => {
    setSelectedAccount(account);
    setTestCaption("");
    setTestImageUrl("");
    setTestPostType("post");
    setIsTestPostDialogOpen(true);
  };

  return (
    <>
      <DashboardHeader 
        title="Instagram Accounts" 
        subtitle="Manage your Instagram Business accounts" 
        importLabel={isLoggedIn ? "Manual Connect" : "Login with Facebook"}
        showImport={true}
        onImport={() => {
          if (isLoggedIn) {
            setIsConnectDialogOpen(true);
          } else {
            window.location.href = '/auth/facebook';
          }
        }}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* CSV Import Navigation */}
        <div className="mb-6 flex justify-end">
          <Link href="/instagram-csv-import">
            <Button variant="outline" className="flex items-center gap-2" data-testid="button-csv-import">
              <FileSpreadsheet className="h-4 w-4" />
              Bulk CSV Import
            </Button>
          </Link>
        </div>
        {!isLoggedIn ? (
          <Card className="mb-6 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5 text-pink-600" />
                Connect Instagram with Facebook
              </CardTitle>
              <CardDescription>
                Login with Facebook to automatically discover your Instagram Business accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We'll automatically discover all Instagram Business accounts linked to your Facebook Pages
                </p>
                <Button 
                  onClick={() => window.location.href = '/auth/facebook'}
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                  data-testid="button-facebook-login"
                >
                  <Instagram className="h-4 w-4 mr-2" />
                  Login with Facebook
                </Button>
                <p className="text-xs text-gray-500">
                  Make sure your Instagram Business account is linked to a Facebook Page
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5 text-pink-600" />
                Instagram Business Accounts
              </CardTitle>
              <CardDescription>
                Your Instagram accounts are automatically synced from Facebook
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>✅ Instagram accounts are automatically discovered when you login with Facebook</p>
                <p>✅ Make sure your Instagram Business account is linked to a Facebook Page</p>
                <p className="text-xs">
                  Don't see your account? <Button variant="link" onClick={() => window.location.href = '/auth/facebook'} className="p-0 h-auto text-pink-600 hover:text-pink-700">Refresh Facebook connection</Button>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Manage Instagram Business accounts for automated posting
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
                  <Instagram className="h-12 w-12 mx-auto mb-4 text-pink-600" />
                  <p className="font-medium">No Instagram accounts connected</p>
                  <p className="text-sm mt-2">
                    {isLoggedIn 
                      ? "Your Instagram accounts are automatically synced from Facebook" 
                      : "Login with Facebook to automatically discover your Instagram accounts"}
                  </p>
                  <Button 
                    variant="default" 
                    className="mt-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                    onClick={() => {
                      if (isLoggedIn) {
                        window.location.href = '/auth/facebook';
                      } else {
                        window.location.href = '/auth/facebook';
                      }
                    }}
                    data-testid="button-connect-instagram"
                  >
                    <Instagram className="h-4 w-4 mr-2" />
                    {isLoggedIn ? "Refresh Facebook Connection" : "Login with Facebook"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <div className="flex items-center space-x-4">
                      {account.profilePictureUrl ? (
                        <img 
                          src={account.profilePictureUrl} 
                          alt={account.username}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <Instagram className="h-10 w-10 text-pink-600" />
                      )}
                      <div>
                        <p className="font-medium">@{account.username}</p>
                        <p className="text-sm text-gray-500">
                          {account.followersCount ? `${account.followersCount.toLocaleString()} followers` : 'Business Account'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={account.isActive}
                          onCheckedChange={(checked) => 
                            toggleAccountMutation.mutate({ id: account.id, isActive: checked })
                          }
                          data-testid={`switch-active-${account.id}`}
                        />
                        <span className={account.isActive ? "text-green-600" : "text-gray-500"}>
                          {account.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openTestPostDialog(account)}
                        className="bg-gradient-to-r from-pink-50 to-purple-50 hover:from-pink-100 hover:to-purple-100 border-pink-200"
                        data-testid={`button-test-post-${account.id}`}
                      >
                        <Send className="h-4 w-4 mr-2 text-pink-600" />
                        Test Post
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" data-testid={`button-delete-${account.id}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Instagram Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will disconnect @{account.username} from your publishing platform. Scheduled posts for this account will be canceled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => deleteAccountMutation.mutate(account.id)}
                            >
                              Remove
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
          {accounts.length > 0 && (
            <CardFooter>
              <Button 
                variant="outline"
                onClick={() => setIsConnectDialogOpen(true)}
                data-testid="button-connect-more"
              >
                <Instagram className="h-4 w-4 mr-2" />
                Connect Another Account
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Connect Instagram Dialog */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-600" />
              Connect Instagram Business Account
            </DialogTitle>
            <DialogDescription>
              Enter your Facebook Page access token to connect your linked Instagram Business account
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConnect}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="pageAccessToken">Facebook Page Access Token</Label>
                <Input
                  id="pageAccessToken"
                  name="pageAccessToken"
                  type="password"
                  placeholder="Paste your Facebook Page access token here"
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  required
                  data-testid="input-page-access-token"
                />
                <p className="text-xs text-gray-500">
                  This token should have instagram_basic and instagram_content_publish permissions
                </p>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsConnectDialogOpen(false)}
                data-testid="button-cancel-connect"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={connectAccountMutation.isPending}
                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                data-testid="button-submit-connect"
              >
                {connectAccountMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Connect Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Test Post Dialog */}
      <Dialog open={isTestPostDialogOpen} onOpenChange={setIsTestPostDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testPostType === 'reel' ? (
                <Video className="h-5 w-5 text-purple-600" />
              ) : (
                <Send className="h-5 w-5 text-pink-600" />
              )}
              Test Instagram {testPostType === 'reel' ? 'Reel' : 'Post'}
            </DialogTitle>
            <DialogDescription>
              Publish a test {testPostType} to @{selectedAccount?.username}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTestPost}>
            <div className="space-y-4 py-4">
              {/* Post Type Selector */}
              <div className="space-y-3">
                <Label>Post Type</Label>
                <RadioGroup value={testPostType} onValueChange={(value) => setTestPostType(value as "post" | "reel")}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <RadioGroupItem value="post" id="post-type-post" data-testid="radio-post-type-post" />
                    <Label htmlFor="post-type-post" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Send className="h-4 w-4 text-pink-600" />
                      <div>
                        <div className="font-medium">Image/Video Post</div>
                        <div className="text-xs text-gray-500">Regular Instagram post</div>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <RadioGroupItem value="reel" id="post-type-reel" data-testid="radio-post-type-reel" />
                    <Label htmlFor="post-type-reel" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Video className="h-4 w-4 text-purple-600" />
                      <div>
                        <div className="font-medium">Instagram Reel</div>
                        <div className="text-xs text-gray-500">Short-form vertical video</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Media URL Input */}
              <div className="space-y-2">
                <Label htmlFor="testImageUrl">
                  {testPostType === 'reel' ? 'Video URL' : 'Image/Video URL'} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="testImageUrl"
                  name="testImageUrl"
                  type="url"
                  placeholder={testPostType === 'reel' ? 'https://example.com/video.mp4' : 'https://example.com/image.jpg'}
                  value={testImageUrl}
                  onChange={(e) => setTestImageUrl(e.target.value)}
                  required
                  data-testid="input-test-image-url"
                />
                <p className="text-xs text-pink-600 font-medium">
                  ✨ Supports: Google Drive, Facebook, Instagram, or any direct URL
                </p>
              </div>

              {/* Caption Input */}
              <div className="space-y-2">
                <Label htmlFor="testCaption">Caption (Optional)</Label>
                <Textarea
                  id="testCaption"
                  name="testCaption"
                  placeholder={`Enter your test ${testPostType} caption... (optional)`}
                  value={testCaption}
                  onChange={(e) => setTestCaption(e.target.value)}
                  rows={4}
                  data-testid="input-test-caption"
                  className="resize-none"
                />
                <p className="text-xs text-gray-500">
                  Add a caption to your test {testPostType} (optional)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsTestPostDialogOpen(false)}
                data-testid="button-cancel-test-post"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={testPostMutation.isPending}
                className={testPostType === 'reel' 
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  : "bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                }
                data-testid="button-submit-test-post"
              >
                {testPostMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Publish Test {testPostType === 'reel' ? 'Reel' : 'Post'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
