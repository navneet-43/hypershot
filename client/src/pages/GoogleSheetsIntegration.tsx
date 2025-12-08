import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

import DashboardHeader from "@/components/common/DashboardHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Check, RefreshCw } from "lucide-react";

const integrationSchema = z.object({
  spreadsheetId: z.string().min(1, "Please select a spreadsheet"),
  mappings: z.object({
    content: z.string().min(1, "Required"),
    scheduledFor: z.string().optional(),
    labels: z.string().optional(),
    language: z.string().optional(),
    link: z.string().optional(),
  }),
});

export default function GoogleSheetsIntegration() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [authUrl, setAuthUrl] = useState("");

  // Get the Google Sheets integration status
  const { data: integration, isLoading: isLoadingIntegration } = useQuery({
    queryKey: ["/api/google-sheets-integration"],
    onSuccess: (data) => {
      if (data && data.accessToken) {
        setConnected(true);
      }
    },
    onError: () => {
      setConnected(false);
    },
  });

  // Get the auth URL for Google connection
  const getAuthUrl = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/google-sheets/auth");
      return response;
    },
    onSuccess: (data) => {
      if (data && data.authUrl) {
        setAuthUrl(data.authUrl);
        window.open(data.authUrl, "_blank");
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to get authentication URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    },
  });

  // Initialize the form
  const form = useForm({
    resolver: zodResolver(integrationSchema),
    defaultValues: {
      spreadsheetId: integration?.spreadsheetId || "",
      mappings: {
        content: "Content",
        scheduledFor: "ScheduleDate",
        labels: "Labels",
        language: "Language",
        link: "Link",
      },
    },
  });

  // Update the integration settings
  const updateIntegration = useMutation({
    mutationFn: async (values: z.infer<typeof integrationSchema>) => {
      return apiRequest("POST", "/api/google-sheets-integration", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-sheets-integration"] });
      toast({
        title: "Settings saved",
        description: "Your Google Sheets integration settings have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to save integration settings: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof integrationSchema>) => {
    updateIntegration.mutate(values);
  };

  const handleConnect = () => {
    getAuthUrl.mutate();
  };

  // Show a loading state while fetching the integration status
  if (isLoadingIntegration) {
    return (
      <>
        <DashboardHeader title="Google Sheets Integration" />
        <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-fb-blue" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardHeader title="Google Sheets Integration" />
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {!connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect to Google Sheets</CardTitle>
              <CardDescription>
                Connect your Google account to import content from Google Sheets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Connecting to Google Sheets allows you to import content directly
                  from your spreadsheets to create Facebook posts.
                </p>
                <Button
                  onClick={handleConnect}
                  disabled={getAuthUrl.isPending}
                  className="bg-fb-blue hover:bg-blue-700"
                >
                  {getAuthUrl.isPending ? "Connecting..." : "Connect to Google Sheets"}
                </Button>
                {authUrl && (
                  <Alert className="mt-4 bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle>Authentication Required</AlertTitle>
                    <AlertDescription>
                      Please complete the authentication process in the new tab that opened.
                      If no tab opened, <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">click here</a>.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="settings">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="settings">Integration Settings</TabsTrigger>
              <TabsTrigger value="field-mapping">Field Mapping</TabsTrigger>
            </TabsList>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <div className="flex-1">Integration Settings</div>
                        {connected && (
                          <div className="flex items-center text-sm text-green-600 font-medium">
                            <Check className="h-5 w-5 mr-1" />
                            Connected
                          </div>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Configure your Google Sheets integration settings
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="spreadsheetId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Google Spreadsheet</FormLabel>
                            <FormControl>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a spreadsheet" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1VD8H2MjeXzUPfnDcX04UJwH7zVRTQUJIerGL9Mm_YPQ">
                                    Marketing Calendar Q3
                                  </SelectItem>
                                  <SelectItem value="1lJUmJGZ-UQjxodSj8-hQh8nzVhmXYv4z1XtPpLi40lM">
                                    Social Media Content
                                  </SelectItem>
                                  <SelectItem value="1KZ8R-YLImFJnDlTPxag6f3pqAqFjRXQHVZHGshHu_5s">
                                    Brand Campaign 2023
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={updateIntegration.isPending}
                          className="bg-fb-blue hover:bg-blue-700"
                        >
                          {updateIntegration.isPending ? "Saving..." : "Save Settings"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="field-mapping">
                  <Card>
                    <CardHeader>
                      <CardTitle>Field Mapping</CardTitle>
                      <CardDescription>
                        Map Google Sheets columns to Facebook post fields
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="mappings.content"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Post Content</FormLabel>
                              <FormControl>
                                <Input placeholder="Content" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="mappings.scheduledFor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Schedule Date</FormLabel>
                              <FormControl>
                                <Input placeholder="ScheduleDate" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="mappings.labels"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Labels</FormLabel>
                              <FormControl>
                                <Input placeholder="Labels" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="mappings.language"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Language</FormLabel>
                              <FormControl>
                                <Input placeholder="Language" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="mappings.link"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Link</FormLabel>
                              <FormControl>
                                <Input placeholder="Link" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={updateIntegration.isPending}
                          className="bg-fb-blue hover:bg-blue-700"
                        >
                          {updateIntegration.isPending ? "Saving..." : "Save Mapping"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </form>
            </Form>
          </Tabs>
        )}
      </div>
    </>
  );
}