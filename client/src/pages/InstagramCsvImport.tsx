import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Upload, Download, AlertCircle, CheckCircle, XCircle, Sparkles, Instagram, ArrowLeft, HardDrive, Video, Eye, Image } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface ImportResult {
  success: boolean;
  message: string;
  imported: number;
  failed: number;
  errors: string[];
}

interface CsvPreviewData {
  totalRows: number;
  googleDriveVideos: number;
  regularVideos: number;
  images: number;
  reels: number;
  data: any[];
}

export default function InstagramCsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [useAiConverter, setUseAiConverter] = useState(false);
  const [useEnhancedGoogleDrive, setUseEnhancedGoogleDrive] = useState(true);
  
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<CsvPreviewData | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to format scheduled time values for display
  // Shows EXACTLY what user entered - no timezone conversion
  const formatScheduledTime = (value: any): string => {
    if (!value) return '-';
    
    // If it's already a formatted readable string
    if (typeof value === 'string') {
      // Check for DD/MM/YYYY HH:MM format and format nicely
      const ddmmMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
      if (ddmmMatch) {
        const [, day, month, year, hours, minutes] = ddmmMatch.map(Number);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const period = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        return `${day} ${monthNames[month - 1]} ${year}, ${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
      }
      // Already formatted from server
      if (value.includes(':') || value.includes('/') || value.includes('⚠️')) {
        return value;
      }
    }
    
    // If it's a number (Excel decimal), convert it
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      if (numValue < 1) {
        return '⚠️ Needs full date!';
      } else if (numValue < 100) {
        return '⚠️ Invalid date format';
      } else {
        // Full Excel date serial number - NO timezone conversion
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const totalDays = numValue;
        const wholeDays = Math.floor(totalDays);
        const timeFraction = totalDays - wholeDays;
        
        const dateMs = excelEpoch.getTime() + wholeDays * 24 * 60 * 60 * 1000;
        const date = new Date(dateMs);
        
        const totalMinutes = Math.round(timeFraction * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const period = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        
        return `${date.getUTCDate()} ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
      }
    }
    
    return String(value);
  };

  const { data: instagramAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/instagram-accounts"],
  });

  const accounts = Array.isArray(instagramAccounts) ? instagramAccounts : [];

  const downloadTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/instagram-csv-import/template", {
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
      link.download = "instagram-posts-template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Template downloaded",
        description: "Instagram CSV template has been downloaded successfully.",
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

  const analyzeMutation = useMutation({
    mutationFn: async ({ file, useAiConverter }: { file: File; useAiConverter: boolean }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("useAiConverter", useAiConverter.toString());

      const response = await fetch("/api/instagram-csv-analyze", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Analysis failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log('📊 Instagram CSV analysis successful:', data);
      setCsvPreviewData(data);
      setCsvPreviewOpen(true);
      toast({
        title: "File analyzed successfully",
        description: `Found ${data.totalRows} posts, ${data.reels || 0} reels, ${data.googleDriveVideos || 0} Google Drive videos`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze file",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, accountId, useAiConverter }: { file: File; accountId: number; useAiConverter: boolean }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", accountId.toString());
      formData.append("useAiConverter", useAiConverter.toString());

      const response = await fetch("/api/instagram-csv-import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
      }

      return response.json();
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      setCsvPreviewOpen(false);
      setImportDialogOpen(false);
      setCsvPreviewData(null);
      setFile(null);
      setSelectedAccountId("");
      
      if (data.success && data.imported > 0) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.imported} Instagram post(s).`,
        });
      } else if (data.failed > 0) {
        toast({
          title: "Import completed with errors",
          description: `${data.imported} succeeded, ${data.failed} failed.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import posts",
        variant: "destructive",
      });
      setImportResult({
        success: false,
        message: error.message || "Import failed",
        imported: 0,
        failed: 0,
        errors: [error.message],
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
      if (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
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
      if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
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

  const handlePreview = () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to preview.",
        variant: "destructive",
      });
      return;
    }

    analyzeMutation.mutate({ file, useAiConverter });
  };

  const handleStartImport = () => {
    if (!selectedAccountId || !csvPreviewData) {
      toast({
        title: "Missing information",
        description: "Please select an Instagram account to continue",
        variant: "destructive"
      });
      return;
    }

    if (!file) {
      toast({
        title: "No file",
        description: "File not found. Please re-upload.",
        variant: "destructive"
      });
      return;
    }

    importMutation.mutate({
      file,
      accountId: parseInt(selectedAccountId),
      useAiConverter,
    });
  };

  const getPostTypeLabel = (mediaType: string | undefined) => {
    const type = (mediaType || '').toLowerCase();
    if (type === 'reel' || type.includes('reel')) return { label: '🎬 Reel', color: 'bg-purple-100 text-purple-800' };
    if (type === 'video' || type.includes('video')) return { label: '📹 Video', color: 'bg-blue-100 text-blue-800' };
    if (type === 'image' || type.includes('image') || type.includes('photo')) return { label: '🖼️ Image', color: 'bg-green-100 text-green-800' };
    return { label: '📝 Post', color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/instagram-accounts">
          <Button variant="ghost" className="mb-4" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Instagram Accounts
          </Button>
        </Link>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2 mb-2">
            <Instagram className="h-8 w-8 text-pink-500" />
            Instagram CSV Import
          </h1>
          <p className="text-muted-foreground">
            Bulk upload Instagram posts, images, videos, and reels via CSV
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Download Template
              </CardTitle>
              <CardDescription>
                Get started with our pre-formatted Excel template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => downloadTemplateMutation.mutate()}
                disabled={downloadTemplateMutation.isPending}
                className="w-full"
                data-testid="button-download-template"
              >
                {downloadTemplateMutation.isPending ? (
                  <>Downloading...</>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download Instagram Import Template
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload File
              </CardTitle>
              <CardDescription>
                Upload your Excel (.xlsx, .xls) or CSV file with Instagram posts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                data-testid="dropzone-file-upload"
              >
                <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop your file here, or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  data-testid="button-browse-file"
                >
                  Browse Files
                </Button>
                {file && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <p className="text-sm font-medium" data-testid="text-selected-file">
                        {file.name}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ai-converter"
                    checked={useAiConverter}
                    onCheckedChange={(checked) => setUseAiConverter(checked as boolean)}
                    data-testid="checkbox-ai-converter"
                  />
                  <Label htmlFor="ai-converter" className="flex items-center gap-2 cursor-pointer">
                    <Sparkles className="h-4 w-4 text-yellow-500" />
                    Smart CSV Converter (AI-powered)
                  </Label>
                </div>
                {useAiConverter && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      AI will automatically convert your CSV format to match Instagram requirements. This works with various column names and structures.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handlePreview}
                  disabled={!file || analyzeMutation.isPending}
                  className="w-full bg-pink-600 hover:bg-pink-700"
                  data-testid="button-preview-posts"
                >
                  {analyzeMutation.isPending ? (
                    <>Analyzing...</>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview Posts
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

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
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="count-imported">
                      {importResult.imported}
                    </div>
                    <div className="text-sm text-muted-foreground">Imported</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="count-failed">
                      {importResult.failed}
                    </div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-semibold mb-2">Errors:</div>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {importResult.errors.slice(0, 5).map((error, index) => (
                          <li key={index} data-testid={`error-${index}`}>{error}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li className="text-muted-foreground">
                            ...and {importResult.errors.length - 5} more errors
                          </li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>CSV Format Guide</CardTitle>
              <CardDescription>Required columns for Instagram imports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">content</span> - Post caption/description (required)
                </div>
                <div>
                  <span className="font-semibold">scheduledFor</span> - When to publish (required, IST timezone)
                </div>
                <div>
                  <span className="font-semibold">mediaUrl</span> - Image/video URL (supports Google Drive, direct URLs)
                </div>
                <div>
                  <span className="font-semibold">mediaType</span> - Type: "image", "video", "reel" (auto-detected if not specified)
                </div>
                <div>
                  <span className="font-semibold">customLabels</span> - Optional tracking labels (comma-separated)
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Instagram Limits:</strong> Images up to 8MB, Videos/Reels up to 650MB. Reels: 90 seconds max, 9:16 aspect ratio recommended.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-500" />
              Instagram CSV Preview
            </DialogTitle>
          </DialogHeader>
          
          {csvPreviewData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-pink-600">{csvPreviewData.totalRows || 0}</div>
                  <div className="text-sm text-pink-700">Total Posts</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{csvPreviewData.reels || 0}</div>
                  <div className="text-sm text-purple-700">Reels</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{csvPreviewData.googleDriveVideos || 0}</div>
                  <div className="text-sm text-green-700">Google Drive Videos</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{csvPreviewData.images || 0}</div>
                  <div className="text-sm text-blue-700">Images</div>
                </div>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">Upload Method</h4>
                    <p className="text-sm text-gray-600">Choose how to handle large Google Drive videos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={useEnhancedGoogleDrive}
                      onCheckedChange={setUseEnhancedGoogleDrive}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Enhanced Google Drive
                    </span>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  {useEnhancedGoogleDrive ? (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 p-2 rounded">
                      <CheckCircle className="h-4 w-4" />
                      <span>Enhanced processing: Large videos with quality preservation</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-blue-700 bg-blue-50 p-2 rounded">
                      <AlertCircle className="h-4 w-4" />
                      <span>Standard processing: Basic upload method for smaller files</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Data Preview ({csvPreviewData.data?.length || 0} rows)</h4>
                <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Content</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Scheduled</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Post Type</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Labels</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Media</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewData.data?.map((row: any, index: number) => {
                          const mediaType = row.mediatype || row.mediaType || row.MediaType || '';
                          const postType = getPostTypeLabel(mediaType);
                          const mediaUrl = row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL'] || '';
                          const content = row.content || row.Content || '';
                          const scheduled = row.scheduledfor || row.scheduledFor || row.ScheduledFor || row['Scheduled Date'] || '';
                          const labels = row.customlabels || row.customLabels || row.CustomLabels || row['Custom Labels'] || '';
                          
                          return (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600 max-w-xs">
                                <div className="truncate" title={content}>
                                  {content || '-'}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium text-pink-600 text-xs">
                                    {formatScheduledTime(scheduled)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${postType.color}`}>
                                  {postType.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                <div className="flex flex-wrap gap-1">
                                  {labels ? (
                                    String(labels).split(',').map((label: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-2 py-1 text-xs bg-pink-100 text-pink-800 rounded-full"
                                      >
                                        {label.trim()}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400">No labels</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {mediaUrl ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1">
                                      {mediaUrl.includes('drive.google.com') ? (
                                        <>
                                          <HardDrive className="h-3 w-3 text-green-600" />
                                          <span className="text-xs font-medium text-green-600">Google Drive</span>
                                        </>
                                      ) : (
                                        <>
                                          {mediaType.toLowerCase().includes('image') || mediaType.toLowerCase().includes('photo') ? (
                                            <>
                                              <Image className="h-3 w-3 text-blue-600" />
                                              <span className="text-xs font-medium text-blue-600">Image</span>
                                            </>
                                          ) : (
                                            <>
                                              <Video className="h-3 w-3 text-purple-600" />
                                              <span className="text-xs font-medium text-purple-600">Video</span>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-32" title={mediaUrl}>
                                      {mediaUrl.includes('drive.google.com') 
                                        ? 'drive.google.com/...' 
                                        : 'External URL'
                                      }
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">No media</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setCsvPreviewOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setCsvPreviewOpen(false);
                    setImportDialogOpen(true);
                  }}
                  className="flex-1 bg-pink-600 hover:bg-pink-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import {csvPreviewData.totalRows} Posts
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-500" />
              Import Instagram Posts
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
              <h4 className="font-medium text-pink-800 mb-2">Import Summary</h4>
              <div className="text-sm text-pink-700 space-y-1">
                <div>• Posts to import: {csvPreviewData?.totalRows || 0}</div>
                <div>• Reels: {csvPreviewData?.reels || 0}</div>
                <div>• Google Drive videos: {csvPreviewData?.googleDriveVideos || 0}</div>
                <div>• Images: {csvPreviewData?.images || 0}</div>
                <div>• Upload method: {useEnhancedGoogleDrive ? 'Enhanced' : 'Standard'}</div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="instagram-account">Select Instagram Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an Instagram account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsLoading ? (
                      <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
                    ) : accounts.length === 0 ? (
                      <SelectItem value="none" disabled>No Instagram accounts connected</SelectItem>
                    ) : (
                      accounts.map((account: any) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          @{account.username}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              {useEnhancedGoogleDrive && (csvPreviewData?.googleDriveVideos || 0) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 mb-2">Enhanced Processing Enabled</h4>
                  <div className="text-sm text-green-700 space-y-1">
                    <div>• Large video support with quality preservation</div>
                    <div>• Optimal processing for Instagram requirements</div>
                    <div>• Automatic Reel format optimization</div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
                className="flex-1"
                disabled={importMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-pink-600 hover:bg-pink-700"
                disabled={!selectedAccountId || !csvPreviewData || importMutation.isPending}
                onClick={handleStartImport}
              >
                {importMutation.isPending ? (
                  <>
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Start Import
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
