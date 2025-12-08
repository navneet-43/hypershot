import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FacebookAccount } from "@shared/schema";
import { FileSpreadsheet, ExternalLink, CheckCircle, AlertCircle, Grid, Users } from "lucide-react";

interface GoogleOAuthConnectorProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GoogleSpreadsheet {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

interface GoogleSheet {
  id: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export function GoogleOAuthConnector({ isOpen, onClose }: GoogleOAuthConnectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [step, setStep] = useState<'connect' | 'select' | 'import'>('connect');

  // Check Google connection status
  const { data: googleStatus } = useQuery({
    queryKey: ['/api/google-sheets-integration'],
    staleTime: 30000,
  });

  // Fetch user's spreadsheets when connected
  const { data: spreadsheetsData, isLoading: spreadsheetsLoading } = useQuery({
    queryKey: ['/api/google/spreadsheets'],
    enabled: googleStatus?.connected && step === 'select',
    staleTime: 60000,
  });

  // Fetch sheets within selected spreadsheet
  const { data: sheetsData } = useQuery({
    queryKey: ['/api/google/spreadsheets', selectedSpreadsheet, 'sheets'],
    enabled: !!selectedSpreadsheet,
    staleTime: 60000,
  });

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

  // Connect to Google
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/google/auth');
      return response;
    },
    onSuccess: (data: any) => {
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=500,height=600');
        // Poll for connection status
        const checkConnection = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/google-sheets-integration'] });
        }, 2000);
        
        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(checkConnection), 30000);
      }
    },
    onError: (error) => {
      toast({
        title: "Connection failed",
        description: (error as Error).message || "Failed to connect to Google",
        variant: "destructive",
      });
    },
  });

  // Import from selected sheet
  const importMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/google/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: selectedSpreadsheet,
          sheetName: selectedSheet,
          accountId: parseInt(selectedAccount),
          range: 'A:Z'
        })
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Import successful",
        description: data.message || "Posts imported successfully",
      });
      
      onClose();
      setStep('connect');
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: (error as Error).message || "Failed to import from Google Sheets",
        variant: "destructive",
      });
    },
  });

  // Disconnect Google account
  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('/api/google/disconnect', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-sheets-integration'] });
      toast({
        title: "Disconnected",
        description: "Google account disconnected successfully",
      });
      setStep('connect');
    },
  });

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleProceedToSelect = () => {
    setStep('select');
  };

  const handleImport = () => {
    if (!selectedSpreadsheet || !selectedSheet || !selectedAccount) {
      toast({
        title: "Missing selection",
        description: "Please select a spreadsheet, sheet, and Facebook page",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate();
  };

  const isConnected = googleStatus?.connected;
  const spreadsheets = spreadsheetsData?.spreadsheets || [];
  const sheets = sheetsData?.sheets || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Import from Google Sheets
          </DialogTitle>
          <DialogDescription>
            Connect your Google account and import content directly from your spreadsheets
          </DialogDescription>
        </DialogHeader>

        {step === 'connect' && (
          <div className="space-y-6">
            {!isConnected ? (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connect your Google account to access your spreadsheets securely
                  </AlertDescription>
                </Alert>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      Secure Google Integration
                    </CardTitle>
                    <CardDescription>
                      Authorize HyperShot to access your Google Sheets with read-only permissions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-sm mb-2">What we access:</h4>
                        <ul className="text-xs text-gray-600 space-y-1">
                          <li>• View your Google Sheets (read-only)</li>
                          <li>• List your spreadsheet files</li>
                          <li>• Read content for importing posts</li>
                        </ul>
                      </div>

                      <Button 
                        onClick={handleConnect}
                        disabled={connectMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {connectMutation.isPending ? "Connecting..." : (
                          <>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Connect Google Account
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Google account connected successfully! You can now access your spreadsheets.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button onClick={handleProceedToSelect} className="flex-1">
                    Select Spreadsheet
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'select' && isConnected && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="spreadsheet-select">Select Spreadsheet</Label>
                <Select value={selectedSpreadsheet} onValueChange={setSelectedSpreadsheet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a spreadsheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {spreadsheetsLoading ? (
                      <SelectItem value="loading" disabled>Loading spreadsheets...</SelectItem>
                    ) : spreadsheets.length > 0 ? (
                      spreadsheets.map((sheet: GoogleSpreadsheet) => (
                        <SelectItem key={sheet.id} value={sheet.id}>
                          <div className="flex items-center gap-2">
                            <Grid className="w-4 h-4 text-green-600" />
                            <span>{sheet.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No spreadsheets found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedSpreadsheet && (
                <div>
                  <Label htmlFor="sheet-select">Select Sheet Tab</Label>
                  <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a sheet tab" />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((sheet: GoogleSheet) => (
                        <SelectItem key={sheet.id} value={sheet.title}>
                          <div className="flex items-center justify-between w-full">
                            <span>{sheet.title}</span>
                            <span className="text-xs text-gray-500 ml-2">
                              {sheet.rowCount} rows
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="facebook-select">Facebook Page</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Facebook page" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">f</span>
                          </div>
                          {account.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Expected columns: Content (required), MediaURL, MediaType, Language, Labels, ScheduledFor, Link
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('connect')}>
                Back
              </Button>
              <Button 
                onClick={handleImport}
                disabled={importMutation.isPending || !selectedSpreadsheet || !selectedSheet || !selectedAccount}
                className="flex-1"
              >
                {importMutation.isPending ? "Importing..." : "Import Posts"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}