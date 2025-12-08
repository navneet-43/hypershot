import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";

export default function GoogleSheetsImportCard() {
  const { toast } = useToast();
  const [dataSource, setDataSource] = useState("api");
  const [spreadsheetId, setSpreadsheetId] = useState("marketing-calendar");
  const [dateRange, setDateRange] = useState("7days");

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/import-from-google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          spreadsheetId, 
          sheetName: "Sheet1",
          dateRange,
          dataSource
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: "Import successful",
        description: `Successfully imported ${data.count || 'multiple'} posts from Google Sheets.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: `Failed to import from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  const handleImport = () => {
    importMutation.mutate();
  };

  return (
    <Card>
      <CardHeader className="px-6 py-5 border-b border-fb-gray">
        <CardTitle className="text-lg font-semibold">Import from Google Sheets</CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="mb-4">
          <Label htmlFor="data-source" className="block text-sm font-medium text-gray-700 mb-1">Data Source</Label>
          <Select
            value={dataSource}
            onValueChange={setDataSource}
          >
            <SelectTrigger id="data-source" className="w-full">
              <SelectValue placeholder="Select data source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="api">Google Sheets API Integration</SelectItem>
              <SelectItem value="excel">Excel Upload</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="mb-4">
          <Label htmlFor="spreadsheet" className="block text-sm font-medium text-gray-700 mb-1">Google Spreadsheet</Label>
          <Select
            value={spreadsheetId}
            onValueChange={setSpreadsheetId}
          >
            <SelectTrigger id="spreadsheet" className="w-full">
              <SelectValue placeholder="Select spreadsheet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>No spreadsheets available - Connect Google Sheets first</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="mb-4">
          <Label htmlFor="date-range" className="block text-sm font-medium text-gray-700 mb-1">Date Range</Label>
          <Select
            value={dateRange}
            onValueChange={setDateRange}
          >
            <SelectTrigger id="date-range" className="w-full">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Next 7 days</SelectItem>
              <SelectItem value="14days">Next 14 days</SelectItem>
              <SelectItem value="30days">Next 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="bg-fb-light-gray rounded-md p-4 mb-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <i className="fa-solid fa-circle-info text-fb-blue"></i>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-700">
                Content will be imported from Google Sheets based on your mapping configuration in settings.
              </p>
            </div>
          </div>
        </div>
        
        <Button 
          className="w-full bg-fb-blue hover:bg-blue-700"
          onClick={handleImport}
          disabled={importMutation.isPending}
        >
          {importMutation.isPending ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2"></i>
              Importing...
            </>
          ) : (
            <>
              <i className="fa-solid fa-file-import mr-2"></i>
              Import Content
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
