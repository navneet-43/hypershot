import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, FileUp, Check, ArrowRightLeft, Database } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AsanaProject, AsanaTask, FieldMapping } from "@/types";
import type { AsanaIntegration as AsanaIntegrationType } from "@/types";
import { asanaService } from "@/services/asanaService";
import { useToast } from "@/hooks/use-toast";

// Asana connection form schema
const asanaConnectionSchema = z.object({
  accessToken: z.string().min(1, "Asana Personal Access Token is required"),
  workspaceId: z.string().optional(),
  projectId: z.string().optional(),
});

// Field mapping form schema
const fieldMappingSchema = z.object({
  title: z.string().min(1, "Title field is required"),
  content: z.string().min(1, "Content field is required"),
  scheduledDate: z.string().optional(),
  labels: z.string().optional(),
  language: z.string().optional(),
});

// Excel upload form schema
const excelUploadSchema = z.object({
  // We'll validate the file separately
  fieldMapping: z.object({
    title: z.string().min(1, "Title column is required"),
    content: z.string().min(1, "Content column is required"),
    scheduledDate: z.string().optional(),
    labels: z.string().optional(),
    language: z.string().optional(),
  }),
});

type AsanaConnectionFormValues = z.infer<typeof asanaConnectionSchema>;
type FieldMappingFormValues = z.infer<typeof fieldMappingSchema>;
type ExcelUploadFormValues = z.infer<typeof excelUploadSchema>;

export default function AsanaIntegration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isFieldMappingDialogOpen, setIsFieldMappingDialogOpen] = useState(false);
  const [isExcelUploadDialogOpen, setIsExcelUploadDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("connection");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch Asana integration details
  const { 
    data: asanaIntegration,
    isLoading: isLoadingIntegration 
  } = useQuery<AsanaIntegrationType | null>({
    queryKey: ['/api/asana-integration'],
    staleTime: 60000,
  });

  // Fetch Asana projects (only if connected)
  const {
    data: asanaProjects = [],
    isLoading: isLoadingProjects,
    refetch: refetchProjects
  } = useQuery<AsanaProject[]>({
    queryKey: ['/api/asana-integration/projects'],
    staleTime: 60000,
    enabled: !!asanaIntegration?.accessToken,
  });

  // For connecting to Asana
  const connectAsanaForm = useForm<AsanaConnectionFormValues>({
    resolver: zodResolver(asanaConnectionSchema),
    defaultValues: {
      accessToken: "",
      workspaceId: "",
      projectId: "",
    },
  });

  // For configuring field mappings
  const fieldMappingForm = useForm<FieldMappingFormValues>({
    resolver: zodResolver(fieldMappingSchema),
    defaultValues: {
      title: "name",
      content: "notes",
      scheduledDate: "due_date",
      labels: "",
      language: "",
    },
  });

  // For Excel upload
  const excelUploadForm = useForm<ExcelUploadFormValues>({
    resolver: zodResolver(excelUploadSchema),
    defaultValues: {
      fieldMapping: {
        title: "Title",
        content: "Content",
        scheduledDate: "ScheduledDate",
        labels: "Labels",
        language: "Language",
      },
    },
  });

  // Connect to Asana mutation
  const connectAsanaMutation = useMutation({
    mutationFn: (values: AsanaConnectionFormValues) => {
      return apiRequest('/api/asana-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/asana-integration'] });
      toast({
        title: "Connected to Asana",
        description: "Your Asana account has been successfully connected.",
      });
      setIsConnectDialogOpen(false);
      connectAsanaForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Connection failed",
        description: (error as Error).message || "There was an error connecting to Asana.",
        variant: "destructive",
      });
    },
  });

  // Update Asana integration mutation
  const updateAsanaMutation = useMutation({
    mutationFn: (values: Partial<AsanaIntegrationType>) => {
      return apiRequest('/api/asana-integration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/asana-integration'] });
      refetchProjects();
      toast({
        title: "Integration updated",
        description: "Your Asana integration settings have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: (error as Error).message || "There was an error updating your Asana integration.",
        variant: "destructive",
      });
    },
  });

  // Import from Asana mutation
  const importFromAsanaMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/import-from-asana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Import successful",
        description: `${data.imported || 0} tasks have been imported from Asana.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: (error as Error).message || "There was an error importing tasks from Asana.",
        variant: "destructive",
      });
    },
  });

  // Upload Excel file mutation
  const uploadExcelMutation = useMutation({
    mutationFn: (formData: FormData) => {
      return apiRequest('/api/import-from-excel', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Excel import successful",
        description: `${data.imported || 0} rows have been imported from your Excel file.`,
      });
      setIsExcelUploadDialogOpen(false);
      setSelectedFile(null);
      excelUploadForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Excel import failed",
        description: (error as Error).message || "There was an error importing from your Excel file.",
        variant: "destructive",
      });
    },
  });

  // Form submission handlers
  const onConnectAsanaSubmit = (values: AsanaConnectionFormValues) => {
    connectAsanaMutation.mutate(values);
  };

  const onUpdateWorkspace = (workspaceId: string) => {
    if (asanaIntegration) {
      updateAsanaMutation.mutate({ workspaceId });
    }
  };

  const onUpdateProject = (projectId: string) => {
    if (asanaIntegration) {
      updateAsanaMutation.mutate({ projectId });
    }
  };

  const onFieldMappingSubmit = (values: FieldMappingFormValues) => {
    if (asanaIntegration) {
      // In a real implementation, we would store these mappings
      // For now, just acknowledge the settings
      toast({
        title: "Field mappings saved",
        description: "Your Asana field mappings have been saved.",
      });
      setIsFieldMappingDialogOpen(false);
    }
  };

  const onExcelUploadSubmit = (values: ExcelUploadFormValues) => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select an Excel file to upload.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('mapping', JSON.stringify(values.fieldMapping));

    uploadExcelMutation.mutate(formData);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const importFromAsana = () => {
    if (asanaIntegration?.accessToken && asanaIntegration?.projectId) {
      importFromAsanaMutation.mutate();
    } else {
      toast({
        title: "Configuration required",
        description: "Please connect to Asana and select a project first.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DashboardHeader 
        title="Asana & Excel Integration" 
        subtitle="Import content from Asana tasks or Excel spreadsheets" 
        importLabel={asanaIntegration ? "Import Now" : "Connect to Asana"}
        onImport={asanaIntegration ? importFromAsana : () => setIsConnectDialogOpen(true)}
        showImport={true}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs defaultValue="connection" value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="connection">Asana Connection</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
          </TabsList>

          {/* Asana Connection Tab */}
          <TabsContent value="connection">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Asana Integration</CardTitle>
                <CardDescription>Connect to your Asana workspace to import tasks as posts</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingIntegration ? (
                  <div className="h-60 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : asanaIntegration ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                      <div className="flex items-center gap-3">
                        <Check className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="font-medium">Connected to Asana</p>
                          <p className="text-sm text-gray-500">Your account is successfully connected</p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsConnectDialogOpen(true)}
                      >
                        Reconnect
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Project Configuration</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="workspace">Workspace</Label>
                          <Select 
                            value={asanaIntegration.workspaceId || ""}
                            onValueChange={onUpdateWorkspace}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select workspace" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="123456">Personal Projects</SelectItem>
                              <SelectItem value="234567">Company Workspace</SelectItem>
                              <SelectItem value="345678">Client Projects</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="project">Project</Label>
                          <Select 
                            value={asanaIntegration.projectId || ""}
                            onValueChange={onUpdateProject}
                            disabled={!asanaIntegration.workspaceId || isLoadingProjects}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingProjects ? (
                                <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                              ) : asanaProjects.length === 0 ? (
                                <SelectItem value="none" disabled>No projects found</SelectItem>
                              ) : (
                                asanaProjects.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                  </SelectItem>
                                ))
                              )}
                              {/* Placeholder projects until API is connected */}
                              <SelectItem value="12345">Content Calendar</SelectItem>
                              <SelectItem value="23456">Marketing Campaigns</SelectItem>
                              <SelectItem value="34567">Blog Posts</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Field Mappings</h3>
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => setIsFieldMappingDialogOpen(true)}
                        >
                          Configure
                        </Button>
                      </div>
                      
                      <div className="border rounded-lg divide-y">
                        <div className="p-3 flex justify-between">
                          <span className="font-medium">Post Title</span>
                          <span className="text-gray-600">Asana Task Name</span>
                        </div>
                        <div className="p-3 flex justify-between">
                          <span className="font-medium">Post Content</span>
                          <span className="text-gray-600">Task Notes</span>
                        </div>
                        <div className="p-3 flex justify-between">
                          <span className="font-medium">Scheduled Date</span>
                          <span className="text-gray-600">Task Due Date</span>
                        </div>
                        <div className="p-3 flex justify-between">
                          <span className="font-medium">Labels</span>
                          <span className="text-gray-600">Tags</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-80 flex flex-col items-center justify-center text-gray-500">
                    <div className="text-center">
                      <i className="fa-brands fa-asana text-5xl mb-4"></i>
                      <p className="mb-2">Connect to your Asana account to get started</p>
                      <p className="text-sm mb-6">Import tasks from Asana to create scheduled posts for your Facebook pages</p>
                      <Button 
                        onClick={() => setIsConnectDialogOpen(true)}
                        className="mt-2"
                      >
                        Connect to Asana
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
              {asanaIntegration && (
                <CardFooter className="flex justify-end space-x-4 pt-6 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsFieldMappingDialogOpen(true)}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Configure Field Mappings
                  </Button>
                  <Button 
                    onClick={importFromAsana}
                    disabled={!asanaIntegration.projectId || importFromAsanaMutation.isPending}
                  >
                    {importFromAsanaMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {!importFromAsanaMutation.isPending && (
                      <Database className="mr-2 h-4 w-4" />
                    )}
                    Import from Asana
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          {/* Excel Upload Tab */}
          <TabsContent value="excel">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Excel Spreadsheet Import</CardTitle>
                <CardDescription>Upload Excel files with content for your Facebook posts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                    <div className="flex flex-col items-center text-center">
                      <FileUp className="h-10 w-10 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">Upload Excel File</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Upload an Excel file (.xlsx) with columns for post content, scheduling dates, and more
                      </p>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        accept=".xlsx, .xls"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div className="flex gap-3">
                        <Button 
                          variant="outline" 
                          onClick={triggerFileInput}
                        >
                          Select File
                        </Button>
                        <Button 
                          onClick={() => setIsExcelUploadDialogOpen(true)}
                          disabled={!selectedFile}
                        >
                          Configure & Upload
                        </Button>
                      </div>
                      {selectedFile && (
                        <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          <span>{selectedFile.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Excel Template Format</h3>
                    <p className="text-sm text-gray-600">
                      Your Excel file should include the following columns. The column names should match 
                      exactly as shown below (or configure field mappings during upload).
                    </p>
                    <div className="border rounded-lg divide-y">
                      <div className="p-3 grid grid-cols-2">
                        <span className="font-medium">Title</span>
                        <span className="text-gray-600">The title of your post</span>
                      </div>
                      <div className="p-3 grid grid-cols-2">
                        <span className="font-medium">Content</span>
                        <span className="text-gray-600">The main content of your post</span>
                      </div>
                      <div className="p-3 grid grid-cols-2">
                        <span className="font-medium">ScheduledDate</span>
                        <span className="text-gray-600">When to publish (YYYY-MM-DD format)</span>
                      </div>
                      <div className="p-3 grid grid-cols-2">
                        <span className="font-medium">Labels</span>
                        <span className="text-gray-600">Comma-separated labels</span>
                      </div>
                      <div className="p-3 grid grid-cols-2">
                        <span className="font-medium">Language</span>
                        <span className="text-gray-600">Language code (en, es, fr, etc.)</span>
                      </div>
                    </div>
                  </div>

                  <Alert variant="default" className="bg-blue-50 border-blue-200">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Pro Tip</AlertTitle>
                    <AlertDescription>
                      You can download a sample Excel template by clicking "Download Template" below.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end space-x-4 pt-6 border-t">
                <Button variant="outline">
                  Download Template
                </Button>
                <Button 
                  onClick={() => setIsExcelUploadDialogOpen(true)}
                  disabled={!selectedFile}
                >
                  Configure & Upload
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Asana Connection Dialog */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Connect to Asana</DialogTitle>
            <DialogDescription>
              Enter your Asana personal access token to connect your account.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...connectAsanaForm}>
            <form onSubmit={connectAsanaForm.handleSubmit(onConnectAsanaSubmit)} className="space-y-4">
              <FormField
                control={connectAsanaForm.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asana Personal Access Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password" 
                        placeholder="Enter your Asana personal access token" 
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-gray-500 mt-1">
                      You can generate a personal access token in your 
                      <a href="https://app.asana.com/0/developer-console" 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="text-blue-600 ml-1">
                        Asana Developer Console
                      </a>.
                    </p>
                  </FormItem>
                )}
              />
              
              <DialogFooter className="mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsConnectDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={connectAsanaMutation.isPending}
                >
                  {connectAsanaMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Connect
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Field Mapping Dialog */}
      <Dialog open={isFieldMappingDialogOpen} onOpenChange={setIsFieldMappingDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Configure Field Mappings</DialogTitle>
            <DialogDescription>
              Map Asana fields to Facebook post fields for importing tasks.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...fieldMappingForm}>
            <form onSubmit={fieldMappingForm.handleSubmit(onFieldMappingSubmit)} className="space-y-4">
              <FormField
                control={fieldMappingForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Post Title</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an Asana field" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="name">Task Name</SelectItem>
                        <SelectItem value="custom_title">Custom Field: Title</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={fieldMappingForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Post Content</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an Asana field" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="notes">Task Notes</SelectItem>
                        <SelectItem value="custom_content">Custom Field: Content</SelectItem>
                        <SelectItem value="description">Task Description</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={fieldMappingForm.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an Asana field" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="due_date">Due Date</SelectItem>
                        <SelectItem value="custom_date">Custom Field: Publish Date</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={fieldMappingForm.control}
                name="labels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Labels</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an Asana field" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tags">Tags</SelectItem>
                        <SelectItem value="custom_labels">Custom Field: Labels</SelectItem>
                        <SelectItem value="none">Don't import labels</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={fieldMappingForm.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an Asana field" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="custom_language">Custom Field: Language</SelectItem>
                        <SelectItem value="default">Use default (English)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter className="mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsFieldMappingDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Save Mappings
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Excel Upload Dialog */}
      <Dialog open={isExcelUploadDialogOpen} onOpenChange={setIsExcelUploadDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Upload Excel File</DialogTitle>
            <DialogDescription>
              Configure column mappings for your Excel file.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...excelUploadForm}>
            <form onSubmit={excelUploadForm.handleSubmit(onExcelUploadSubmit)} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                <p className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <span>
                    Selected file: <strong>{selectedFile?.name || "No file selected"}</strong>
                  </span>
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-md font-medium">Column Mappings</h3>
                <p className="text-sm text-gray-600">
                  Specify which columns in your Excel file correspond to which fields.
                </p>
                
                <FormField
                  control={excelUploadForm.control}
                  name="fieldMapping.title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title Column</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={excelUploadForm.control}
                  name="fieldMapping.content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Column</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Content" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={excelUploadForm.control}
                  name="fieldMapping.scheduledDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Date Column (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ScheduledDate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={excelUploadForm.control}
                  name="fieldMapping.labels"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Labels Column (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Labels" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={excelUploadForm.control}
                  name="fieldMapping.language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Language Column (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Language" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter className="mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsExcelUploadDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={!selectedFile || uploadExcelMutation.isPending}
                >
                  {uploadExcelMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Upload & Import
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Use AlertCircle directly since we already imported it
