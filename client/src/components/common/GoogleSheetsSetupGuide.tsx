import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, ExternalLink, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GoogleSheetsSetupGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (credentials: { accessToken: string; spreadsheetId: string }) => void;
}

export function GoogleSheetsSetupGuide({ isOpen, onClose, onComplete }: GoogleSheetsSetupGuideProps) {
  const { toast } = useToast();
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [activeTab, setActiveTab] = useState("setup");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text copied to clipboard",
    });
  };

  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
  };

  const handleSpreadsheetUrlChange = (value: string) => {
    const id = extractSpreadsheetId(value);
    setSpreadsheetId(id);
  };

  const handleComplete = () => {
    if (!accessToken || !spreadsheetId) {
      toast({
        title: "Missing information",
        description: "Please provide both access token and spreadsheet ID",
        variant: "destructive",
      });
      return;
    }
    onComplete({ accessToken, spreadsheetId });
  };

  const steps = [
    {
      title: "Create Google Cloud Project",
      description: "Set up a new project in Google Cloud Console",
      url: "https://console.cloud.google.com/",
    },
    {
      title: "Enable Google Sheets API",
      description: "Navigate to APIs & Services > Library",
      url: "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
    },
    {
      title: "Create Credentials",
      description: "Generate OAuth 2.0 credentials or service account",
      url: "https://console.cloud.google.com/apis/credentials",
    },
    {
      title: "Get Access Token",
      description: "Use OAuth Playground to generate token",
      url: "https://developers.google.com/oauthplayground/",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Google Sheets API Setup
          </DialogTitle>
          <DialogDescription>
            Follow these steps to connect your Google Sheets account
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="format">Sheet Format</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4">
            <div className="space-y-4">
              {steps.map((step, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      {step.title}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {step.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(step.url, '_blank')}
                      className="w-full"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open {step.title}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                For OAuth access token, select "Google Sheets API v4" in OAuth Playground, 
                authorize APIs, then exchange code for tokens.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="credentials" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="access-token">Google Sheets API Access Token</Label>
                <Input
                  id="access-token"
                  type="password"
                  placeholder="Enter your access token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get this from Google OAuth Playground or your service account
                </p>
              </div>

              <div>
                <Label htmlFor="spreadsheet-url">Google Spreadsheet URL or ID</Label>
                <Input
                  id="spreadsheet-url"
                  placeholder="https://docs.google.com/spreadsheets/d/YOUR_ID/edit or just the ID"
                  onChange={(e) => handleSpreadsheetUrlChange(e.target.value)}
                />
                {spreadsheetId && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <strong>Extracted ID:</strong> {spreadsheetId}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(spreadsheetId)}
                      className="ml-2 h-6 px-2"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Make sure your Google Sheet is shared with your service account email or 
                  is publicly accessible for viewing.
                </AlertDescription>
              </Alert>
            </div>
          </TabsContent>

          <TabsContent value="format" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Required Sheet Columns</CardTitle>
                <CardDescription className="text-xs">
                  Your Google Sheet should include these columns:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">Content</span>
                    <span>Post message (required)</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">MediaURL</span>
                    <span>Image/video link</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">MediaType</span>
                    <span>photo, video, or none</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">Language</span>
                    <span>en, es, fr, etc.</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">Labels</span>
                    <span>Comma-separated tags</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">ScheduledFor</span>
                    <span>YYYY-MM-DD HH:MM</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">Link</span>
                    <span>Optional URL to include</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Example Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto">
                  <div className="whitespace-nowrap">
                    Content | MediaURL | MediaType | Language<br/>
                    "New product launch!" | "https://drive.google.com/..." | "photo" | "en"<br/>
                    "Check our website" | "" | "none" | "en"
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {activeTab === "credentials" && (
            <Button onClick={handleComplete} disabled={!accessToken || !spreadsheetId}>
              Complete Setup
            </Button>
          )}
          {activeTab !== "credentials" && (
            <Button onClick={() => setActiveTab("credentials")}>
              Next: Enter Credentials
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}