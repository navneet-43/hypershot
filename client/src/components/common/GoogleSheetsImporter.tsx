import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FacebookAccount } from "@shared/schema";
import { AlertCircle, FileSpreadsheet, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const importSchema = z.object({
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  sheetName: z.string().min(1, "Sheet name is required"),
  range: z.string().optional(),
  accountId: z.string().min(1, "Please select a Facebook page"),
});

type ImportFormValues = z.infer<typeof importSchema>;

interface GoogleSheetsImporterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GoogleSheetsImporter({ isOpen, onClose }: GoogleSheetsImporterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'setup' | 'import'>('setup');

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

  // Check Google Sheets integration status
  const { data: integration } = useQuery({
    queryKey: ['/api/google-sheets-integration'],
    staleTime: 60000,
  });

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      spreadsheetId: "",
      sheetName: "Sheet1",
      range: "A:Z",
      accountId: "",
    },
  });

  const importMutation = useMutation({
    mutationFn: (data: ImportFormValues) => {
      return apiRequest('/api/import-from-google-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          accountId: parseInt(data.accountId),
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Import successful",
        description: data.message || "Posts imported successfully",
      });
      
      onClose();
      form.reset();
      setStep('setup');
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: (error as Error).message || "Failed to import from Google Sheets",
        variant: "destructive",
      });
    },
  });

  const setupIntegrationMutation = useMutation({
    mutationFn: (data: { accessToken: string; spreadsheetId: string }) => {
      return apiRequest('/api/google-sheets-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-sheets-integration'] });
      setStep('import');
      toast({
        title: "Integration setup",
        description: "Google Sheets integration configured successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Setup failed",
        description: (error as Error).message || "Failed to setup Google Sheets integration",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ImportFormValues) => {
    importMutation.mutate(values);
  };

  const handleSetupIntegration = () => {
    const accessToken = prompt('Please enter your Google Sheets API access token:');
    const spreadsheetId = prompt('Please enter your Google Spreadsheet ID:');
    
    if (accessToken && spreadsheetId) {
      setupIntegrationMutation.mutate({ accessToken, spreadsheetId });
    }
  };

  const extractSpreadsheetId = (url: string): string => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
  };

  const isConnected = integration && integration.accessToken;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Import from Google Sheets
          </DialogTitle>
          <DialogDescription>
            Import posts from your Google Sheets spreadsheet to schedule for Facebook publishing
          </DialogDescription>
        </DialogHeader>

        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You need to connect your Google Sheets account first to import data.
              </AlertDescription>
            </Alert>

            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Setup Instructions:</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Get a Google Sheets API access token from Google Cloud Console</li>
                  <li>Copy your spreadsheet ID from the Google Sheets URL</li>
                  <li>Click the setup button below to configure the integration</li>
                </ol>
              </div>

              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Spreadsheet URL example:</p>
                <code className="text-xs">https://docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</code>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSetupIntegration} disabled={setupIntegrationMutation.isPending}>
                {setupIntegrationMutation.isPending ? "Setting up..." : "Setup Integration"}
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="spreadsheetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spreadsheet ID or URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter spreadsheet ID or paste full URL"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          const id = extractSpreadsheetId(value);
                          field.onChange(id);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sheetName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sheet Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Sheet1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="range"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Range (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="A:Z" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facebook Page</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a Facebook page" />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Expected columns: Content (required), MediaURL, MediaType, Language, Labels, ScheduledFor, Link
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={importMutation.isPending}>
                  {importMutation.isPending ? "Importing..." : "Import Posts"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}