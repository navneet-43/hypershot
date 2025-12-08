import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GoogleSheetsSetupSimpleProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (credentials: { accessToken: string; spreadsheetId: string }) => void;
}

export function GoogleSheetsSetupSimple({ isOpen, onClose, onComplete }: GoogleSheetsSetupSimpleProps) {
  const { toast } = useToast();
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");

  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
  };

  const handleComplete = () => {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    
    if (!accessToken || !spreadsheetId) {
      toast({
        title: "Missing information",
        description: "Please provide both access token and spreadsheet URL/ID",
        variant: "destructive",
      });
      return;
    }
    
    onComplete({ accessToken, spreadsheetId });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Google Sheets API Setup
          </DialogTitle>
          <DialogDescription>
            Connect your Google Sheets account to import content
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              You need a Google Cloud project with Sheets API enabled and OAuth credentials.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="access-token">Google API Access Token</Label>
              <Input
                id="access-token"
                type="password"
                placeholder="Enter your Google Sheets API access token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Get this from Google OAuth Playground or your service account
              </p>
            </div>

            <div>
              <Label htmlFor="spreadsheet-url">Google Spreadsheet URL</Label>
              <Input
                id="spreadsheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/YOUR_ID/edit"
                value={spreadsheetUrl}
                onChange={(e) => setSpreadsheetUrl(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Copy the full URL from your Google Sheet
              </p>
            </div>

            <div className="bg-gray-50 p-3 rounded-md text-xs">
              <p className="font-medium mb-2">Quick Setup Steps:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  <a 
                    href="https://developers.google.com/oauthplayground/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    Go to OAuth Playground <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>Select "Google Sheets API v4" and authorize</li>
                <li>Exchange authorization code for tokens</li>
                <li>Copy the access token and your sheet URL</li>
              </ol>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Expected columns: Content (required), MediaURL, MediaType, Language, Labels, ScheduledFor, Link
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={!accessToken || !spreadsheetUrl}>
              Connect Google Sheets
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}