import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Upload, Download, AlertCircle, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportResult {
  success: boolean;
  message: string;
  imported: number;
  failed: number;
  errors: string[];
}

export default function ExcelImport() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [useAiConverter, setUseAiConverter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch Facebook accounts
  const { data: facebookAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/facebook-accounts"],
  });

  // Ensure accounts is always an array
  const accounts = Array.isArray(facebookAccounts) ? facebookAccounts : [];

  const downloadTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/excel-import/template", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to download template");
      }
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "posts-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Template downloaded",
        description: "Excel template has been downloaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Download failed",
        description: error.message || "Failed to download template",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { file: File; accountId: string; useAiConverter: boolean }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("accountId", data.accountId);
      formData.append("useAiConverter", data.useAiConverter.toString());

      const response = await fetch("/api/excel-import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Import failed");
      }

      return response.json();
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/posts/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      if (data.success) {
        toast({
          title: "Import successful",
          description: `${data.imported} posts imported successfully.`,
        });
      } else {
        toast({
          title: "Import completed with errors",
          description: `${data.imported} posts imported, ${data.failed} failed.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import file",
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (isValidFile(droppedFile)) {
        setFile(droppedFile);
        setImportResult(null);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload Excel (.xlsx, .xls) or CSV files only.",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidFile(selectedFile)) {
        setFile(selectedFile);
        setImportResult(null);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload Excel (.xlsx, .xls) or CSV files only.",
          variant: "destructive",
        });
        e.target.value = "";
      }
    }
  };

  const isValidFile = (file: File) => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv"
    ];
    return validTypes.includes(file.type) || file.name.endsWith('.csv');
  };

  const handleImport = () => {
    if (file && selectedAccountId) {
      importMutation.mutate({ file, accountId: selectedAccountId, useAiConverter });
    } else {
      toast({
        title: "Missing information",
        description: "Please select both a file and a Facebook page before importing.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bulk Import</h1>
          <p className="text-gray-600 mt-1">Upload Excel or CSV files to import multiple posts at once</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Template Download Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download Template
            </CardTitle>
            <CardDescription>
              Get the Excel template with the correct format for importing posts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Template includes:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Content (required)</li>
                  <li>• Scheduled Date & Time in IST (required)</li>
                  <li>• Custom Labels</li>
                  <li>• Language (EN, HI, etc.)</li>
                  <li>• Media URL & Type</li>
                  <li>• Facebook Page will be selected below</li>
                </ul>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  YouTube Video Support
                </h4>
                <p className="text-sm text-green-800">
                  YouTube URLs in Media URL column will be automatically downloaded and uploaded as actual video files to Facebook during import.
                </p>
              </div>
              
              <Button 
                onClick={() => downloadTemplateMutation.mutate()}
                disabled={downloadTemplateMutation.isPending}
                className="w-full"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {downloadTemplateMutation.isPending ? "Downloading..." : "Download Template"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* File Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload File
            </CardTitle>
            <CardDescription>
              Upload your Excel (.xlsx, .xls) or CSV file with posts data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                
                {file ? (
                  <div className="space-y-2">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                    <p className="text-gray-600">
                      Drag and drop your file here, or{" "}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports .xlsx, .xls, and .csv files
                    </p>
                  </div>
                )}
              </div>

              {file && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="facebook-account">Select Facebook Page</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a Facebook page..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsLoading ? (
                          <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
                        ) : !Array.isArray(accounts) || accounts.length === 0 ? (
                          <SelectItem value="no-accounts" disabled>No Facebook accounts found</SelectItem>
                        ) : (
                          accounts.map((account: any) => (
                            <SelectItem key={account.id} value={account.id.toString()}>
                              {account.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* AI Converter Option */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox 
                        id="ai-converter"
                        checked={useAiConverter}
                        onCheckedChange={(checked) => setUseAiConverter(checked === true)}
                      />
                      <div className="flex-1">
                        <Label 
                          htmlFor="ai-converter" 
                          className="flex items-center gap-2 font-medium text-purple-900 cursor-pointer"
                        >
                          <Sparkles className="h-4 w-4" />
                          Smart CSV Converter (AI-powered)
                        </Label>
                        <p className="text-sm text-purple-700 mt-1">
                          Automatically converts any CSV format to work with HyperShot. 
                          Perfect for files with different column names or structures.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleImport}
                      disabled={importMutation.isPending || !selectedAccountId}
                      className="flex-1"
                    >
                      {importMutation.isPending ? "Importing..." : "Import Posts"}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setFile(null);
                        setSelectedAccountId("");
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Results */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {importResult.message}
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {importResult.imported}
                  </div>
                  <div className="text-sm text-green-800">Posts Imported</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.failed}
                  </div>
                  <div className="text-sm text-red-800">Posts Failed</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-900 mb-2">Errors:</h4>
                  <div className="bg-red-50 p-3 rounded-lg max-h-40 overflow-y-auto">
                    <ul className="text-sm text-red-800 space-y-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}