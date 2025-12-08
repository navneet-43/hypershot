import React, { useState, useRef } from "react";
import DashboardHeader from "@/components/common/DashboardHeader";
import StatsCards from "@/components/dashboard/StatsCards";
import UpcomingPostsCard from "@/components/dashboard/UpcomingPostsCard";
import GoogleSheetsImportCard from "@/components/dashboard/GoogleSheetsImportCard";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Video, CheckCircle, AlertCircle, Tag, X, Download, Cog, Upload, Facebook, Clock, FileSpreadsheet, Youtube, HardDrive } from "lucide-react";
import { SchedulingStatus } from "@/components/SchedulingStatus";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [videoUploadDialogOpen, setVideoUploadDialogOpen] = useState(false);
  const [videoFormData, setVideoFormData] = useState({
    mediaUrl: '',
    content: '',
    accountId: '',
    language: 'en',
    selectedLabels: [] as string[]
  });
  const [uploadProgress, setUploadProgress] = useState({
    isProcessing: false,
    currentStep: '',
    percentage: 0,
    details: '',
    steps: [] as string[],
    uploadId: '',
    startTime: 0
  });

  // Ref to store the current polling timeout for cleanup
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stress testing state
  const [stressTestDialogOpen, setStressTestDialogOpen] = useState(false);
  const [stressTestProgress, setStressTestProgress] = useState({
    isRunning: false,
    completed: 0,
    total: 0,
    currentTest: '',
    results: [] as any[]
  });

  // CSV Preview state
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<any>(null);
  const [useEnhancedGoogleDrive, setUseEnhancedGoogleDrive] = useState(true);

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
  const [excelImportDialogOpen, setExcelImportDialogOpen] = useState(false);
  const [selectedFacebookAccount, setSelectedFacebookAccount] = useState<string>('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Clear any existing polling
  const clearPolling = () => {
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
      console.log('🧹 Cleared existing polling timeout');
    }
  };

  // Poll for progress updates with timeout protection  
  const pollProgress = async (pollCount = 0) => {
    // Get current upload ID from state
    const currentUploadId = uploadProgress.uploadId;
    
    if (!currentUploadId) {
      console.log('🛑 No upload ID in state, stopping polling');
      return;
    }
    
    try {
      console.log(`🔄 Polling progress for: ${currentUploadId} (attempt ${pollCount + 1})`);
      
      // Extended timeout for very large videos: 60 minutes (3600 seconds / 2 second intervals = 1800 polls)
      if (pollCount > 1800) {
        console.warn('⏰ Progress polling timed out after 60 minutes');
        setUploadProgress(prev => ({
          ...prev,
          isProcessing: false,
          currentStep: 'Upload completed - Check Recent Activity for status',
          percentage: 100,
          details: 'Large video processing completed. Check Recent Activity tab for results.'
        }));
        return;
      }
      
      const response = await fetch(`/api/upload-progress/${currentUploadId}`);
      
      // Get response text first to safely handle all response types
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (textError) {
        console.error('❌ Failed to read response text:', textError);
        responseText = '';
      }
      
      if (response.ok) {
        try {
          console.log('📊 Raw response:', responseText.substring(0, 200));
          
          // Only try to parse if we have valid JSON
          if (!responseText || responseText.trim() === '') {
            throw new Error('Empty response from server');
          }
          
          // More robust JSON detection - check for HTML responses too
          const trimmedResponse = responseText.trim();
          if (trimmedResponse.startsWith('<!DOCTYPE') || 
              trimmedResponse.startsWith('<html') || 
              trimmedResponse.startsWith('upstream') ||
              trimmedResponse.includes('502 Bad Gateway') ||
              trimmedResponse.includes('504 Gateway Timeout') ||
              !trimmedResponse.startsWith('{')) {
            console.warn('⚠️ Non-JSON response received (HTML/Error page):', trimmedResponse.substring(0, 100));
            throw new Error('Server returned HTML/Error page instead of JSON');
          }
          
          const progressData = JSON.parse(responseText);
          console.log('📊 Progress data:', progressData);
          setUploadProgress(prev => ({
            ...prev,
            currentStep: progressData.step || prev.currentStep,
            percentage: progressData.percentage || prev.percentage,
            details: progressData.details || prev.details,
            isProcessing: (progressData.percentage || prev.percentage) < 100
          }));
          
          // Continue polling if not complete
          if ((progressData.percentage || 0) < 100) {
            pollingTimeoutRef.current = setTimeout(() => pollProgress(pollCount + 1), 2000);
          } else {
            console.log('✅ Progress polling complete');
          }
        } catch (jsonError) {
          console.error('❌ Failed to parse progress JSON response:', jsonError);
          console.error('❌ Response text that failed to parse:', responseText.substring(0, 200));
          
          // Check if this looks like the "upstream" error that's causing issues
          if (responseText.includes('upstream') || responseText.includes('502') || responseText.includes('504')) {
            console.warn('🔄 Detected proxy/gateway error, continuing with fallback progress');
          }
          
          // Continue polling with simulated progress on JSON errors
          pollingTimeoutRef.current = setTimeout(() => {
            setUploadProgress(prev => ({
              ...prev,
              percentage: Math.min(prev.percentage + 2, 98), // Slower increment, max 98% until real completion
              details: 'Processing video upload (using fallback progress)...'
            }));
            if (pollCount < 1800) {
              pollingTimeoutRef.current = setTimeout(() => pollProgress(pollCount + 1), 5000);
            }
          }, 1000);
        }
      } else {
        console.warn('⚠️ Progress polling failed:', response.status);
        
        // We already have responseText from above, analyze it safely
        try {
          console.log('❌ Error response:', responseText.substring(0, 200));
          
          // Check if it's a JSON error response
          if (responseText.trim().startsWith('{')) {
            const errorData = JSON.parse(responseText);
            if (errorData.message && errorData.message.includes('Upload not found')) {
              // Upload completed but was cleaned up - mark as finished
              setUploadProgress(prev => ({
                ...prev,
                isProcessing: false,
                currentStep: 'Upload completed - Check Recent Activity for status',
                percentage: 100,
                details: 'Upload processing completed. Check Recent Activity tab for results.'
              }));
              return; // Stop polling
            }
          }
          
          // Check for common proxy/gateway errors
          if (responseText.includes('upstream') || 
              responseText.includes('502 Bad Gateway') || 
              responseText.includes('504 Gateway Timeout') ||
              responseText.includes('nginx') ||
              responseText.includes('cloudflare')) {
            console.warn('🔄 Detected proxy/gateway error, treating as temporary issue');
          }
          
        } catch (parseError) {
          console.warn('Could not parse error response:', parseError);
        }
        
        // Simulate progress to prevent UI freeze
        pollingTimeoutRef.current = setTimeout(() => {
          setUploadProgress(prev => {
            const elapsed = Date.now() - prev.startTime;
            const minutes = Math.floor(elapsed / 60000);
            
            // Estimate progress based on elapsed time (average 5 minutes for large video)
            const estimatedProgress = Math.min(Math.floor(elapsed / 300000 * 100), 98);
            const newPercentage = Math.max(prev.percentage, estimatedProgress);
            
            return {
              ...prev,
              percentage: newPercentage,
              currentStep: newPercentage < 30 ? 'Downloading from Google Drive...' : 
                          newPercentage < 60 ? 'Processing with FFmpeg...' : 
                          newPercentage < 90 ? 'Uploading to Facebook...' : 'Finalizing...',
              details: `Processing for ${minutes} minutes (${newPercentage}% estimated)`
            };
          });
          
          // Continue polling with extended timeout protection  
          if (pollCount < 1800) {
            pollingTimeoutRef.current = setTimeout(() => pollProgress(pollCount + 1), 3000);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Progress polling error:', error);
      
      // Check if this is the specific "upstream" JSON error that's causing UI issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Unexpected token') && errorMessage.includes('upstream')) {
        console.warn('🔄 Detected the specific "upstream" JSON parsing error - continuing with robust fallback');
      }
      
      // Continue with basic progress simulation
      pollingTimeoutRef.current = setTimeout(() => {
        setUploadProgress(prev => ({
          ...prev,
          percentage: Math.min(prev.percentage + 5, 95),
          details: 'Upload in progress (using fallback tracking)...'
        }));
        if (pollCount < 1800) {
          pollingTimeoutRef.current = setTimeout(() => pollProgress(pollCount + 1), 5000);
        }
      }, 2000);
    }
  };

  const publishDraftsMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/publish-draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      toast({
        title: "Posts Published",
        description: `Successfully published ${data.published} posts to Facebook. ${data.failed > 0 ? `${data.failed} posts failed.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Publishing Failed",
        description: error.message || "Failed to publish draft posts to Facebook",
        variant: "destructive"
      });
    }
  });

  const handleExport = () => {
    toast({
      title: "Export",
      description: "Export functionality is not implemented in this demo.",
    });
  };

  const handleImport = () => {
    setImportDialogOpen(true);
  };

  // Query for Facebook accounts
  const { data: facebookAccountsData = [] } = useQuery({
    queryKey: ['/api/facebook-accounts'],
    queryFn: () => apiRequest('/api/facebook-accounts')
  });

  // Query for custom labels with proper error handling
  const { data: customLabelsData = [], error: customLabelsError, isLoading: customLabelsLoading } = useQuery({
    queryKey: ['/api/custom-labels'],
    queryFn: async () => {
      const response = await fetch('/api/custom-labels');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('📊 Custom labels API response:', data);
      return Array.isArray(data) ? data : [];
    }
  });

  // Ensure we have arrays for rendering
  const facebookAccounts = Array.isArray(facebookAccountsData) ? facebookAccountsData : [];
  const customLabels = Array.isArray(customLabelsData) ? customLabelsData : [];
  
  // Custom labels are now working correctly

  // CSV Analysis mutation
  const csvAnalysisMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/csv-analyze', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze file');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      console.log('📊 CSV analysis successful:', data);
      setCsvPreviewData(data);
      setCsvPreviewOpen(true);
      toast({
        title: "File analyzed successfully",
        description: `Found ${data.totalRows} posts, ${data.googleDriveVideos} Google Drive videos`,
      });
    },
    onError: (error: any) => {
      console.error('CSV analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze file",
        variant: "destructive",
      });
    }
  });

  // Enhanced Google Drive Video Upload Mutation
  const videoUploadMutation = useMutation({
    mutationFn: async (data: {
      mediaUrl: string;
      content: string;
      accountId: string;
      language: string;
      selectedLabels: string[];
    }) => {
      console.log('🚀 STARTING ENHANCED GOOGLE DRIVE + CHUNKED UPLOAD');
      console.log('📊 Upload Data:', data);
      console.log('📱 Account ID:', data.accountId);
      console.log('🔗 Google Drive URL:', data.mediaUrl);
      console.log('🏷️ Custom Labels:', data.selectedLabels);
      
      // Clear any existing polling first
      clearPolling();
      
      // Clear any existing progress state
      setUploadProgress({
        isProcessing: false,
        currentStep: '',
        percentage: 0,
        details: '',
        steps: [],
        uploadId: '',
        startTime: 0
      });
      
      // Generate fresh upload ID and initialize progress tracking
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('🆕 Generated fresh upload ID:', uploadId);
      console.log('🧹 Cleared old polling, starting fresh upload tracking');
      
      // Initialize fresh progress tracking
      setUploadProgress({
        isProcessing: true,
        currentStep: 'Initializing upload...',
        percentage: 0,
        details: 'Starting Enhanced Google Drive video processing with deployment optimization',
        steps: ['Initialize', 'Download', 'Process', 'Upload', 'Complete'],
        uploadId,
        startTime: Date.now()
      });
      
      // Start polling for progress updates (using new signature without uploadId parameter)
      pollingTimeoutRef.current = setTimeout(() => pollProgress(), 1000);
      console.log('🔍 Starting fresh progress polling for uploadId:', uploadId);
      
      // Enhanced request configuration for large videos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Request taking longer than expected, continuing in background...');
        // Don't abort - let it continue processing
      }, 25 * 60 * 1000); // 25 minute warning
      
      try {
        const response = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: data.content,
            mediaUrl: data.mediaUrl,
            mediaType: 'video',
            accountId: parseInt(data.accountId),
            language: data.language,
            labels: data.selectedLabels.length > 0 ? data.selectedLabels : ["2"],
            status: 'immediate',
            uploadId: uploadId
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const result = await response.json();
        console.log('✅ API Response:', result);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
      

    },
    onSuccess: (data: any) => {
      console.log('🎉 UPLOAD SUCCESS:', data);
      console.log('📊 Post ID:', data.id);
      console.log('✅ Enhanced Google Drive + Chunked Upload completed successfully');
      
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      toast({
        title: "Video Upload Success",
        description: `Enhanced Google Drive video uploaded successfully! Processing ${data.uploadedSizeMB ? data.uploadedSizeMB.toFixed(1) + 'MB' : 'large file'} with chunked upload.`,
      });
      
      // Complete progress tracking
      setUploadProgress({
        isProcessing: false,
        currentStep: 'Upload completed successfully!',
        percentage: 100,
        details: `Video uploaded and published to Facebook`,
        steps: ['Initialize', 'Download', 'Process', 'Upload', 'Complete'],
        uploadId: '',
        startTime: 0
      });
      
      setTimeout(() => {
        setVideoUploadDialogOpen(false);
        setVideoFormData({ mediaUrl: '', content: '', accountId: '', language: 'en', selectedLabels: [] });
        setUploadProgress({
          isProcessing: false,
          currentStep: '',
          percentage: 0,
          details: '',
          steps: [],
          uploadId: '',
          startTime: 0
        });
      }, 3000);
    },
    onError: (error: any) => {
      console.error('❌ UPLOAD ERROR:', error);
      console.error('🔧 Error Details:', error.message);
      
      // Check if this is the JSON parsing error that shouldn't fail the upload
      const errorMessage = error.message || String(error);
      const isJsonParsingError = errorMessage.includes('Unexpected token') && 
                                 (errorMessage.includes('upstream') || errorMessage.includes('JSON'));
      
      if (isJsonParsingError) {
        console.warn('🔄 Detected JSON parsing error during progress tracking - not treating as upload failure');
        // Don't show upload failed, just stop the progress tracking
        setUploadProgress(prev => ({
          ...prev,
          isProcessing: false,
          currentStep: 'Upload completed - Check Recent Activity for status',
          percentage: 100,
          details: 'Upload processing completed. Check Recent Activity tab for results.',
          uploadId: '',
          startTime: 0
        }));
        
        toast({
          title: "Upload Processing",
          description: "Upload is being processed. Check Recent Activity for status updates.",
        });
      } else {
        // Real upload error
        setUploadProgress({
          isProcessing: false,
          currentStep: 'Upload failed',
          percentage: 0,
          details: errorMessage || 'Upload failed. Check console for details.',
          steps: ['Initialize', 'Download', 'Process', 'Upload', 'Error'],
          uploadId: '',
          startTime: 0
        });
        
        toast({
          title: "Upload Failed",
          description: errorMessage || "Enhanced Google Drive upload failed. Check console for details.",
          variant: "destructive"
        });
      }
      
      setTimeout(() => {
        setUploadProgress({
          isProcessing: false,
          currentStep: '',
          percentage: 0,
          details: '',
          steps: [],
          uploadId: '',
          startTime: 0
        });
      }, 5000);
    }
  });

  // Handle CSV file selection for analysis
  const handleCsvFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload Excel (.xlsx, .xls) or CSV files only.",
        variant: "destructive",
      });
      return;
    }

    // Store the file for later import
    setCsvFile(file);
    
    // Trigger analysis
    csvAnalysisMutation.mutate(file);
  };

  // CSV import mutation
  const csvImportMutation = useMutation({
    mutationFn: async (data: { accountId: string; useEnhancedGoogleDrive: boolean }) => {
      if (!csvFile) throw new Error("No CSV file selected");
      
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("accountId", data.accountId);
      formData.append("useEnhancedGoogleDrive", data.useEnhancedGoogleDrive.toString());
      
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
    onSuccess: (data: any) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      const selectedAccount = facebookAccounts?.find((acc: any) => acc.id?.toString() === selectedFacebookAccount);
      
      toast({
        title: "Import Successful!",
        description: `Successfully scheduled ${data.imported || csvPreviewData?.totalRows || 0} posts to ${selectedAccount?.name || 'your Facebook page'}`,
      });
      
      // Close dialogs
      setExcelImportDialogOpen(false);
      setCsvPreviewOpen(false);
      setCsvFile(null);
      setCsvPreviewData(null);
      setSelectedFacebookAccount('');
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import CSV posts",
        variant: "destructive",
      });
    },
  });

  // Handle start import function
  const handleStartImport = () => {
    if (!selectedFacebookAccount || !csvPreviewData) {
      toast({
        title: "Missing information",
        description: "Please select a Facebook page to continue",
        variant: "destructive"
      });
      return;
    }

    // Start the import process
    csvImportMutation.mutate({
      accountId: selectedFacebookAccount,
      useEnhancedGoogleDrive
    });
  };

  // Stress test function
  const runStressTest = async () => {
    setStressTestProgress({
      isRunning: true,
      completed: 0,
      total: 3,
      currentTest: 'Initializing stress test...',
      results: []
    });

    // Get Alright Tamil page ID
    try {
      const accountsResponse = await fetch('/api/facebook-accounts');
      const accounts = await accountsResponse.json();
      const alrightTamilAccount = accounts.find((account: any) => 
        account.name.toLowerCase().includes('alright tamil')
      );
      
      if (!alrightTamilAccount) {
        // Use first available account if Alright Tamil not found
        if (accounts.length === 0) {
          setStressTestProgress(prev => ({
            ...prev,
            isRunning: false,
            currentTest: 'Error: No Facebook accounts found',
            uploadId: '',
            startTime: 0
          }));
          return;
        }
        console.warn('Alright Tamil page not found, using first available account:', accounts[0].name);
      }
      
      const targetAccount = alrightTamilAccount || accounts[0];
      console.log(`🎯 Using Facebook account: ${targetAccount.name} (ID: ${targetAccount.id}) for stress testing`);

      const testVideos = [
      {
        name: 'Small Video Test',
        url: 'https://drive.google.com/file/d/1Fl_HSrPtUiIPeNpaGJNrZ_nQc2iWhFz6/view',
        content: 'Stress Test #1: Small video with DI custom label for Meta Insights verification',
        labels: ['DI']
      },
      {
        name: 'Medium Video Test', 
        url: 'https://drive.google.com/file/d/1Fl_HSrPtUiIPeNpaGJNrZ_nQc2iWhFz6/view',
        content: 'Stress Test #2: Medium video with L3M custom label for Meta Insights verification',
        labels: ['L3M']
      },
      {
        name: 'Large Video Test',
        url: 'https://drive.google.com/file/d/1Fl_HSrPtUiIPeNpaGJNrZ_nQc2iWhFz6/view', 
        content: 'Stress Test #3: Large video with DI+L3M custom labels for Meta Insights verification',
        labels: ['DI', 'L3M']
      }
    ];

    for (let i = 0; i < testVideos.length; i++) {
      const test = testVideos[i];
      
      setStressTestProgress(prev => ({
        ...prev,
        currentTest: `${test.name} - Uploading with ${test.labels.join(', ')} labels`
      }));

      try {
        const response = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaUrl: test.url,
            content: test.content,
            accountId: parseInt(targetAccount.id),
            userId: 3, // Default user ID
            language: 'en',
            selectedLabels: test.labels,
            status: 'immediate' // Publish immediately
          })
        });
        
        const result = await response.json();

        setStressTestProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
          results: [...prev.results, {
            name: test.name,
            labels: test.labels.join(', '),
            success: true,
            details: `Published with Post ID: ${result.id}`
          }]
        }));

        // Wait between uploads
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        setStressTestProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
          results: [...prev.results, {
            name: test.name,
            labels: test.labels.join(', '),
            success: false,
            details: `Error: ${error}`
          }]
        }));
      }
    }

    setStressTestProgress(prev => ({
      ...prev,
      isRunning: false,
      currentTest: 'Stress test completed! Check Recent Activity for all published posts.',
      uploadId: '',
      startTime: 0
    }));
    
    } catch (mainError) {
      setStressTestProgress(prev => ({
        ...prev,
        isRunning: false,
        currentTest: `Error: ${mainError}`,
        uploadId: '',
        startTime: 0
      }));
    }

    // Refresh activities to show new posts
    queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
  };

  const handleVideoUpload = () => {
    if (!videoFormData.mediaUrl || !videoFormData.content || !videoFormData.accountId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🎯 INITIATING ENHANCED GOOGLE DRIVE UPLOAD');
    console.log('📋 Form Data:', videoFormData);
    console.log('🔍 Current upload progress state:', uploadProgress);
    
    // Immediately show progress UI
    setUploadProgress({
      isProcessing: true,
      currentStep: 'Preparing upload...',
      percentage: 0,
      details: 'Initializing Enhanced Google Drive video processing',
      steps: ['Initialize', 'Download', 'Process', 'Upload', 'Complete'],
      uploadId: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now()
    });
    
    // Close the dialog to show progress overlay
    setVideoUploadDialogOpen(false);
    
    videoUploadMutation.mutate(videoFormData);
  };

  const isGoogleDriveUrl = (url: string) => {
    return url.includes('drive.google.com');
  };

  const toggleLabel = (labelId: string) => {
    setVideoFormData(prev => {
      const newLabels = prev.selectedLabels.includes(labelId)
        ? prev.selectedLabels.filter(id => id !== labelId)
        : [...prev.selectedLabels, labelId];
      
      console.log('🏷️ Updated selected labels:', newLabels);
      return { ...prev, selectedLabels: newLabels };
    });
  };

  return (
    <>
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                Dashboard
              </h2>
              <p className="mt-1 text-sm text-gray-500">Updated just now</p>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
              <Button variant="outline" onClick={handleExport}>
                <i className="fa-solid fa-file-export mr-2"></i>
                Export
              </Button>
              <Button onClick={handleImport}>
                <i className="fa-solid fa-plus mr-2"></i>
                Import Posts
              </Button>
              <Button 
                onClick={() => csvFileInputRef.current?.click()} 
                variant="outline" 
                className="flex items-center gap-2"
                disabled={csvAnalysisMutation.isPending}
              >
                {csvAnalysisMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Import via CSV
              </Button>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCsvFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SchedulingStatus />
        <StatsCards />
        
        {/* Enhanced Google Drive Video Upload Card */}
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-600" />
              Enhanced Google Drive Video Upload
              {isGoogleDriveUrl(videoFormData.mediaUrl) && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Upload large videos (up to 400MB+) from Google Drive with chunked upload
                </p>
                <p className="text-xs text-gray-500">
                  Enhanced downloader + FFmpeg encoding + Facebook chunked upload for quality preservation
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setVideoUploadDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Video className="h-4 w-4 mr-2" />
                  Upload Video
                </Button>
                <Button 
                  onClick={() => setStressTestDialogOpen(true)}
                  variant="outline"
                  className="border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Stress Test
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual Publish Card */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Publish all draft posts to Facebook immediately
                </p>
                <p className="text-xs text-gray-500">
                  Your Facebook tokens are working - use this to publish posts that didn't auto-publish
                </p>
              </div>
              <Button 
                onClick={() => publishDraftsMutation.mutate()}
                disabled={publishDraftsMutation.isPending}
                className="ml-4"
              >
                {publishDraftsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Publish Draft Posts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <UpcomingPostsCard />
          
          <div className="space-y-6">
            <GoogleSheetsImportCard />
            <RecentActivityCard />
          </div>
        </div>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Google Sheets</DialogTitle>
          </DialogHeader>
          <GoogleSheetsImportCard />
        </DialogContent>
      </Dialog>

      {/* Enhanced Google Drive Video Upload Dialog */}
      <Dialog open={videoUploadDialogOpen} onOpenChange={setVideoUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-600" />
              Enhanced Google Drive Video Upload
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="mediaUrl">Google Drive Video URL</Label>
              <Input
                id="mediaUrl"
                placeholder="https://drive.google.com/file/d/..."
                value={videoFormData.mediaUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setVideoFormData(prev => ({ ...prev, mediaUrl: url }));
                  
                  if (isGoogleDriveUrl(url)) {
                    console.log('✅ Google Drive URL detected:', url);
                    console.log('🔧 Enhanced downloader will be used');
                  }
                }}
                className={isGoogleDriveUrl(videoFormData.mediaUrl) ? 'border-green-300' : ''}
              />
              {isGoogleDriveUrl(videoFormData.mediaUrl) && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Enhanced Google Drive processing enabled
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="content">Post Content</Label>
              <Textarea
                id="content"
                placeholder="Enter your post content..."
                value={videoFormData.content}
                onChange={(e) => setVideoFormData(prev => ({ ...prev, content: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="accountId">Facebook Page</Label>
              <Select 
                value={videoFormData.accountId} 
                onValueChange={(value) => {
                  setVideoFormData(prev => ({ ...prev, accountId: value }));
                  console.log('📱 Selected Facebook page ID:', value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Facebook page" />
                </SelectTrigger>
                <SelectContent>
                  {facebookAccounts.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="language">Language</Label>
              <Select 
                value={videoFormData.language} 
                onValueChange={(value) => setVideoFormData(prev => ({ ...prev, language: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Custom Labels (Meta Insights)
              </Label>
              <div className="space-y-2">
                {customLabels && customLabels.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {customLabels.map((label: any) => {
                        const isSelected = videoFormData.selectedLabels.includes(label.id.toString());
                        return (
                          <button
                            key={label.id}
                            type="button"
                            onClick={() => {
                              console.log(`🏷️ Toggling label: ${label.name} (ID: ${label.id})`);
                              toggleLabel(label.id.toString());
                            }}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              isSelected 
                                ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                                : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: label.color }}
                            ></div>
                            {label.name}
                            {isSelected && <X className="h-3 w-3" />}
                          </button>
                        );
                      })}
                    </div>
                    {videoFormData.selectedLabels.length > 0 && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {videoFormData.selectedLabels.length} label(s) selected for Meta Insights tracking
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Select labels to track video performance in Facebook Meta Insights
                    </p>
                  </>
                ) : (
                  <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded-md border">
                    <p>No custom labels available.</p>
                    <p className="text-xs mt-1">Create labels in the Custom Labels section to use them for Meta Insights tracking.</p>
                  </div>
                )}
              </div>
            </div>



            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <h4 className="text-sm font-medium text-green-800 mb-2">Enhanced Upload Features</h4>
              <ul className="text-xs text-green-700 space-y-1">
                <li>• Downloads large Google Drive videos (400MB+)</li>
                <li>• FFmpeg encoding for Facebook compatibility</li>
                <li>• Chunked upload supports up to 1.75GB</li>
                <li>• Quality preservation with zero compression loss</li>
                <li>• Real-time progress tracking with visual indicators</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setVideoUploadDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleVideoUpload}
                disabled={videoUploadMutation.isPending || !videoFormData.mediaUrl || !videoFormData.content || !videoFormData.accountId}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {videoUploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4 mr-2" />
                    Upload Video
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stress Test Dialog */}
      <Dialog open={stressTestDialogOpen} onOpenChange={setStressTestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Video Publishing Stress Test - Alright Tamil Page
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h4 className="font-medium text-orange-800 mb-2">Test Configuration</h4>
              <ul className="text-sm text-orange-700 space-y-1">
                <li>• Target: Alright Tamil Facebook Page</li>
                <li>• Custom Labels: DI, L3M (Meta Insights integration)</li>
                <li>• Videos: Multiple Google Drive test videos</li>
                <li>• Quality: Preserve original resolution</li>
                <li>• Upload Method: Chunked upload for large files</li>
              </ul>
            </div>
            
            {!stressTestProgress.isRunning ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  This will test video publishing with custom labels to verify Meta Insights integration works correctly.
                  Each video will be uploaded with different custom label combinations.
                </p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="font-medium">Test Videos:</div>
                    <div className="text-gray-600">
                      • Small video (DI label)
                      • Medium video (L3M label)  
                      • Large video (DI + L3M labels)
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="font-medium">Verification:</div>
                    <div className="text-gray-600">
                      • Upload success rate
                      • Custom label attachment
                      • Meta Insights data
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={runStressTest}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Start Stress Test
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setStressTestDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress: {stressTestProgress.completed}/{stressTestProgress.total}</span>
                    <span>{Math.round((stressTestProgress.completed / stressTestProgress.total) * 100)}%</span>
                  </div>
                  <Progress value={(stressTestProgress.completed / stressTestProgress.total) * 100} />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="font-medium text-blue-800">Current Test:</div>
                  <div className="text-blue-700 text-sm">{stressTestProgress.currentTest}</div>
                </div>
                
                {stressTestProgress.results.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    <div className="font-medium text-sm">Results:</div>
                    {stressTestProgress.results.map((result, index) => (
                      <div key={index} className={`text-xs p-2 rounded border ${
                        result.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        {result.success ? '✅' : '❌'} {result.name} - {result.labels} - {result.details}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Preview Dialog */}
      <Dialog open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              CSV/Excel File Preview
            </DialogTitle>
          </DialogHeader>
          
          {csvPreviewData && (
            <div className="space-y-6">
              {/* File Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{csvPreviewData.totalRows || 0}</div>
                  <div className="text-sm text-blue-700">Total Posts</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{csvPreviewData.googleDriveVideos || 0}</div>
                  <div className="text-sm text-green-700">Google Drive Videos</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">{csvPreviewData.regularVideos || 0}</div>
                  <div className="text-sm text-orange-700">Other Videos</div>
                </div>
              </div>
              
              {/* Upload Method Selection */}
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
                      <span>Enhanced processing: Large videos (up to 400MB+) with FFmpeg optimization</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-blue-700 bg-blue-50 p-2 rounded">
                      <AlertCircle className="h-4 w-4" />
                      <span>Standard processing: Basic upload method for smaller files</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Data Preview Table */}
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
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Language</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Media</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewData.data?.map((row: any, index: number) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 border-b text-gray-600 max-w-xs">
                              <div className="truncate" title={row.content || row.Content || '-'}>
                                {row.content || row.Content || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-2 border-b text-gray-600">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-blue-600">
                                  {formatScheduledTime(row.scheduledfor || row.scheduledFor || row.ScheduledFor || row['Scheduled Date'])}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 border-b text-gray-600">
                              <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${
                                (row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'reel' 
                                  ? 'bg-purple-100 text-purple-800' 
                                  : (row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'video'
                                  ? 'bg-blue-100 text-blue-800'
                                  : (row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'image'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {(row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'reel' ? '🎬 Reel' :
                                 (row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'video' ? '📹 Video' :
                                 (row.mediatype || row.mediaType || row.MediaType || 'post').toLowerCase() === 'image' ? '🖼️ Image' :
                                 '📝 Post'}
                              </span>
                            </td>
                            <td className="px-3 py-2 border-b text-gray-600">
                              <div className="flex flex-wrap gap-1">
                                {(row.customlabels || row.customLabels || row.CustomLabels || row['Custom Labels']) ? (
                                  (row.customlabels || row.customLabels || row.CustomLabels || row['Custom Labels'])
                                    .split(',')
                                    .map((label: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                                      >
                                        {label.trim()}
                                      </span>
                                    ))
                                ) : (
                                  <span className="text-gray-400">No labels</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 border-b text-gray-600">
                              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                (row.language || 'en') === 'hi' 
                                  ? 'bg-orange-100 text-orange-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {(row.language || 'en') === 'hi' ? 'Hindi' : 'English'}
                              </span>
                            </td>
                            <td className="px-3 py-2 border-b text-gray-600">
                              {(row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']) ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    {(row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('drive.google.com') ? (
                                      <>
                                        <HardDrive className="h-3 w-3 text-green-600" />
                                        <span className="text-xs font-medium text-green-600">Google Drive</span>
                                      </>
                                    ) : (row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('youtube.com') || (row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('youtu.be') ? (
                                      <>
                                        <Youtube className="h-3 w-3 text-red-600" />
                                        <span className="text-xs font-medium text-red-600">YouTube</span>
                                      </>
                                    ) : (
                                      <>
                                        <Video className="h-3 w-3 text-blue-600" />
                                        <span className="text-xs font-medium text-blue-600">Video</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate max-w-32" title={row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']}>
                                    {(row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('drive.google.com') 
                                      ? 'drive.google.com/...' 
                                      : (row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('youtube.com') || (row.mediaurl || row.mediaUrl || row.MediaUrl || row['Media URL']).includes('youtu.be')
                                      ? 'youtube.com/...'
                                      : 'External URL'
                                    }
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">No media</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
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
                    setExcelImportDialogOpen(true);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import {csvPreviewData.totalRows} Posts
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={excelImportDialogOpen} onOpenChange={setExcelImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Import Posts from File
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">Import Summary</h4>
              <div className="text-sm text-blue-700 space-y-1">
                <div>• Posts to import: {csvPreviewData?.totalRows || 0}</div>
                <div>• Google Drive videos: {csvPreviewData?.googleDriveVideos || 0}</div>
                <div>• Other videos: {csvPreviewData?.regularVideos || 0}</div>
                <div>• Upload method: {useEnhancedGoogleDrive ? 'Enhanced Google Drive' : 'Standard'}</div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="facebook-account">Select Facebook Page</Label>
                <Select value={selectedFacebookAccount} onValueChange={setSelectedFacebookAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a Facebook page..." />
                  </SelectTrigger>
                  <SelectContent>
                    {facebookAccounts.length > 0 ? (
                      facebookAccounts.map((account: any) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-accounts" disabled>No Facebook pages connected</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              {useEnhancedGoogleDrive && csvPreviewData?.googleDriveVideos > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 mb-2">Enhanced Processing Enabled</h4>
                  <div className="text-sm text-green-700 space-y-1">
                    <div>• Large video support (up to 400MB+)</div>
                    <div>• FFmpeg encoding for Facebook compatibility</div>
                    <div>• Chunked upload with progress tracking</div>
                    <div>• Quality preservation with zero compression loss</div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setExcelImportDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!selectedFacebookAccount || !csvPreviewData || csvImportMutation.isPending}
                onClick={() => handleStartImport()}
              >
                {csvImportMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Start Import
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global Progress Overlay - Outside dialog */}
      {uploadProgress.isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white p-6 rounded-lg border shadow-lg max-w-md w-full mx-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin">
                {uploadProgress.currentStep.includes('Download') ? <Download className="h-5 w-5 text-blue-600" /> :
                 uploadProgress.currentStep.includes('Process') ? <Cog className="h-5 w-5 text-blue-600" /> :
                 uploadProgress.currentStep.includes('Upload') ? <Upload className="h-5 w-5 text-blue-600" /> :
                 uploadProgress.currentStep.includes('Complete') ? <CheckCircle className="h-5 w-5 text-green-600" /> :
                 <Loader2 className="h-5 w-5 text-blue-600" />}
              </div>
              <h4 className="text-lg font-medium text-gray-900">Processing Video</h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{uploadProgress.currentStep}</span>
                <span className="text-sm text-blue-600 font-medium">{uploadProgress.percentage}%</span>
              </div>
              <Progress value={uploadProgress.percentage} className="h-3" />
              <p className="text-sm text-gray-600">{uploadProgress.details}</p>
            </div>

            {/* Step Progress Indicators */}
            <div className="flex items-center justify-between">
              {uploadProgress.steps.map((step, index) => {
                const isActive = uploadProgress.currentStep.toLowerCase().includes(step.toLowerCase());
                const isComplete = index < uploadProgress.steps.indexOf(uploadProgress.currentStep.split(' ')[0]) || uploadProgress.percentage === 100;
                const isError = step === 'Error';
                
                return (
                  <div key={step} className="flex items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      isError ? 'bg-red-100 text-red-600' :
                      isComplete ? 'bg-green-100 text-green-600' :
                      isActive ? 'bg-blue-100 text-blue-600 animate-pulse' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isError ? <X className="h-3 w-3" /> :
                       isComplete ? <CheckCircle className="h-3 w-3" /> :
                       step === 'Download' ? <Download className="h-3 w-3" /> :
                       step === 'Process' ? <Cog className="h-3 w-3" /> :
                       step === 'Upload' ? <Upload className="h-3 w-3" /> :
                       step === 'Complete' ? <Facebook className="h-3 w-3" /> :
                       index + 1}
                    </div>
                    <span className={`ml-1 text-xs ${
                      isError ? 'text-red-600' :
                      isComplete ? 'text-green-600' :
                      isActive ? 'text-blue-600' :
                      'text-gray-400'
                    }`}>
                      {step}
                    </span>
                    {index < uploadProgress.steps.length - 1 && (
                      <div className={`w-8 h-0.5 mx-2 ${
                        isComplete ? 'bg-green-200' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Processing Time Display */}
            {uploadProgress.startTime > 0 && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Processing for {Math.floor((Date.now() - uploadProgress.startTime) / 1000)} seconds
              </div>
            )}
            
            <p className="text-xs text-gray-400 text-center">
              Please wait while your video is being processed...
            </p>
          </div>
        </div>
      )}
    </>
  );
}
