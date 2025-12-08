import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Download, Upload, Video, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface VideoDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
  videoInfo?: {
    title?: string;
    duration?: string;
    quality?: string;
  };
}

interface VideoUploadResult {
  success: boolean;
  facebookPostId?: string;
  error?: string;
}

interface FacebookAccount {
  id: number;
  accountName: string;
  pageId: string;
  pageName: string;
}

export default function FacebookVideoDownload() {
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [content, setContent] = useState("");
  const [downloadResult, setDownloadResult] = useState<VideoDownloadResult | null>(null);
  const [uploadResult, setUploadResult] = useState<VideoUploadResult | null>(null);
  const { toast } = useToast();

  // Fetch Facebook accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts']
  });

  // Download video mutation
  const downloadMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest('/api/facebook-video/download', {
        method: 'POST',
        body: JSON.stringify({ url }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response as unknown as VideoDownloadResult;
    },
    onSuccess: (data: VideoDownloadResult) => {
      setDownloadResult(data);
      if (data.success) {
        toast({
          title: "Download Successful",
          description: `Video downloaded: ${data.filename}`,
          variant: "default",
        });
        // Auto-fill content with video title if available
        if (data.videoInfo?.title && !content) {
          setContent(data.videoInfo.title);
        }
      } else {
        toast({
          title: "Download Failed",
          description: data.error || "Failed to download video",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Download Error",
        description: error.message || "An error occurred during download",
        variant: "destructive",
      });
    }
  });

  // Upload video mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!downloadResult?.filePath || !selectedAccount) {
        throw new Error("No video downloaded or account selected");
      }
      
      const response = await apiRequest('/api/facebook-video/upload', {
        method: 'POST',
        body: JSON.stringify({
          filePath: downloadResult.filePath,
          accountId: parseInt(selectedAccount),
          content,
          videoInfo: downloadResult.videoInfo
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response as unknown as VideoUploadResult;
    },
    onSuccess: (data: VideoUploadResult) => {
      setUploadResult(data);
      if (data.success) {
        toast({
          title: "Upload Successful",
          description: `Video posted to Facebook! Post ID: ${data.facebookPostId}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Upload Failed",
          description: data.error || "Failed to upload video",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upload Error",
        description: error.message || "An error occurred during upload",
        variant: "destructive",
      });
    }
  });

  const handleDownload = () => {
    if (!videoUrl) {
      toast({
        title: "URL Required",
        description: "Please enter a Facebook video URL",
        variant: "destructive",
      });
      return;
    }
    
    downloadMutation.mutate(videoUrl);
  };

  const handleUpload = () => {
    if (!downloadResult?.success) {
      toast({
        title: "No Video Downloaded",
        description: "Please download a video first",
        variant: "destructive",
      });
      return;
    }

    if (!selectedAccount) {
      toast({
        title: "Account Required",
        description: "Please select a Facebook account",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate();
  };

  const resetForm = () => {
    setVideoUrl("");
    setContent("");
    setSelectedAccount("");
    setDownloadResult(null);
    setUploadResult(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Facebook Video Download & Upload</h1>
          <p className="text-muted-foreground">
            Download Facebook videos in highest quality and repost them to your pages
          </p>
        </div>

        {/* Test Case Info */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800 flex items-center gap-2">
              <Video className="h-5 w-5" />
              Test Case
            </CardTitle>
            <CardDescription className="text-blue-600">
              Test with this video URL and post to Alright Tamil page
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 bg-white rounded border">
              <ExternalLink className="h-4 w-4 text-blue-500" />
              <code className="text-sm">https://www.facebook.com/AlrightNaari/videos/777342924821005</code>
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Download Video */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Step 1: Download Video
            </CardTitle>
            <CardDescription>
              Enter a Facebook video URL to download it in highest quality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-url">Facebook Video URL</Label>
              <Input
                id="video-url"
                placeholder="https://www.facebook.com/page/videos/123456789"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={downloadMutation.isPending}
              />
            </div>

            <Button 
              onClick={handleDownload}
              disabled={downloadMutation.isPending || !videoUrl}
              className="w-full"
            >
              {downloadMutation.isPending ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Video
                </>
              )}
            </Button>

            {/* Download Result */}
            {downloadResult && (
              <div className="mt-4 p-4 rounded-lg border">
                {downloadResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Download Successful</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><strong>File:</strong> {downloadResult.filename}</p>
                      {downloadResult.videoInfo?.title && (
                        <p><strong>Title:</strong> {downloadResult.videoInfo.title}</p>
                      )}
                      {downloadResult.videoInfo?.duration && (
                        <p><strong>Duration:</strong> {downloadResult.videoInfo.duration}</p>
                      )}
                      {downloadResult.videoInfo?.quality && (
                        <Badge variant="secondary">{downloadResult.videoInfo.quality}</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Download Failed: {downloadResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Upload to Facebook */}
        {downloadResult?.success && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Step 2: Upload to Facebook Page
              </CardTitle>
              <CardDescription>
                Select a Facebook page and upload the downloaded video
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-select">Facebook Page</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Facebook page" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading">Loading accounts...</SelectItem>
                    ) : (
                      accounts?.map((account) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.pageName} ({account.accountName})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Post Content</Label>
                <Textarea
                  id="content"
                  placeholder="Write a caption for your video post..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                />
              </div>

              <Button 
                onClick={handleUpload}
                disabled={uploadMutation.isPending || !selectedAccount}
                className="w-full"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Upload className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload to Facebook
                  </>
                )}
              </Button>

              {/* Upload Result */}
              {uploadResult && (
                <div className="mt-4 p-4 rounded-lg border">
                  {uploadResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">Upload Successful</span>
                      </div>
                      <div className="text-sm">
                        <p><strong>Facebook Post ID:</strong> {uploadResult.facebookPostId}</p>
                        <a 
                          href={`https://www.facebook.com/${uploadResult.facebookPostId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          View Post <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>Upload Failed: {uploadResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reset Button */}
        <div className="text-center">
          <Button variant="outline" onClick={resetForm}>
            Start Over
          </Button>
        </div>
      </div>
    </div>
  );
}