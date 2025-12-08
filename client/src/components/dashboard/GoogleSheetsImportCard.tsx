import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FacebookAccount } from "@shared/schema";
import { AlertCircle, Settings, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleOAuthConnector } from "@/components/common/GoogleOAuthConnector";

export default function GoogleSheetsImportCard() {
  const { toast } = useToast();
  const [showConnector, setShowConnector] = useState(false);

  // Check Google Sheets integration status
  const { data: integration } = useQuery({
    queryKey: ['/api/google-sheets-integration'],
    staleTime: 60000,
  });

  const isConnected = integration && (integration as any).connected;

  return (
    <Card>
      <CardHeader className="px-6 py-5 border-b border-fb-gray">
        <CardTitle className="text-lg font-semibold">Import from Google Sheets</CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {isConnected 
                ? "Google account connected. Click below to import from your spreadsheets."
                : "Connect your Google account to import content from your spreadsheets."
              }
            </AlertDescription>
          </Alert>
          
          <Button 
            className="w-full bg-fb-blue hover:bg-blue-700 flex items-center gap-2"
            onClick={() => setShowConnector(true)}
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isConnected ? "Import from Google Sheets" : "Connect Google Account"}
          </Button>
          
          {isConnected && (
            <div className="bg-gray-50 p-3 rounded-md text-xs text-gray-600">
              <p className="font-medium mb-1">Expected sheet columns:</p>
              <p>Content (required), MediaURL, MediaType, Language, Labels, ScheduledFor, Link</p>
            </div>
          )}
        </div>
        
        <GoogleOAuthConnector
          isOpen={showConnector}
          onClose={() => setShowConnector(false)}
        />
      </CardContent>
    </Card>
  );
}