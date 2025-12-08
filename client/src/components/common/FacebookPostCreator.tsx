import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Image, Video, MapPin, Smile, Hash, Link2, Users, Globe, Lock, TrendingUp, ChevronDown, Check, ChevronsUpDown, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FacebookAccount, CustomLabel, InstagramAccount, SnapchatAccount } from "@shared/schema";
import MediaUpload from "@/components/common/MediaUpload";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  platform: z.enum(["facebook", "instagram", "snapchat"]).default("facebook"),
  accountId: z.string().min(1, "Please select an account"),
  instagramAccountId: z.string().optional(),
  snapchatAccountId: z.string().optional(),
  snapchatPublishType: z.enum(["story", "spotlight", "saved_story"]).default("story"),
  content: z.string().min(1, "Content is required"),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(["none", "photo", "video", "reel"]).default("none"),
  link: z.string().url().optional().or(z.literal("")),
  language: z.string().default("en"),
  labels: z.array(z.string()).default([]),
  scheduledFor: z.date().optional(),
  scheduledTime: z.string().optional(),
  status: z.enum(["draft", "scheduled", "immediate"]).default("draft"),
  collaborator: z.string().optional(),
  privacy: z.enum(["public", "restricted"]).default("public"),
  boost: z.boolean().default(false),
  crosspost: z.boolean().default(false),
  crosspostTo: z.array(z.string()).default([]),
  postToInstagram: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface FacebookPostCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FacebookPostCreator({ isOpen, onClose }: FacebookPostCreatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);
  const scheduleEnabledRef = useRef(false);

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

  // Fetch Instagram accounts
  const { data: instagramAccounts = [] } = useQuery<InstagramAccount[]>({
    queryKey: ['/api/instagram-accounts'],
    staleTime: 60000,
  });

  // Fetch Snapchat accounts
  const { data: snapchatAccounts = [] } = useQuery<SnapchatAccount[]>({
    queryKey: ['/api/snapchat-accounts'],
    staleTime: 60000,
  });

  // Fetch custom labels
  const { data: customLabels = [] } = useQuery<CustomLabel[]>({
    queryKey: ['/api/custom-labels'],
    staleTime: 60000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      platform: "facebook",
      accountId: "",
      content: "",
      mediaUrl: "",
      mediaType: "none",
      link: "",
      language: "en",
      labels: [],
      status: "draft",
      collaborator: "",
      privacy: "public",
      boost: false,
      crosspost: false,
      crosspostTo: [],
      postToInstagram: false,
      instagramAccountId: "",
      snapchatAccountId: "",
      snapchatPublishType: "story",
      scheduledFor: new Date(),
      scheduledTime: "14:00",
    },
  });

  const watchCrosspost = form.watch("crosspost");
  const watchPlatform = form.watch("platform");

  const createPostMutation = useMutation({
    mutationFn: (postData: any) => {
      return apiRequest('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Post created",
        description: "Your post has been successfully created.",
      });
      
      onClose();
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error creating post",
        description: (error as Error).message || "There was an error creating your post.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    console.log('🔍 FORM SUBMIT DEBUG:');
    console.log('🔍 Platform:', values.platform);
    console.log('🔍 isScheduleEnabled:', isScheduleEnabled);
    console.log('🔍 values.scheduledFor:', values.scheduledFor);
    console.log('🔍 values.scheduledTime:', values.scheduledTime);
    
    // Clean base data with platform-specific account handling
    const baseData: any = {
      platform: values.platform,
      content: values.content,
      mediaUrl: values.mediaUrl || "",
      mediaType: values.mediaType,
      link: values.link || "",
      language: values.language,
      labels: values.labels,
      collaborator: values.collaborator || "",
      privacy: values.privacy,
      boost: values.boost,
      crosspost: values.crosspost,
      crosspostTo: values.crosspostTo,
    };
    
    // Set account ID based on platform
    if (values.platform === 'instagram') {
      baseData.instagramAccountId = values.instagramAccountId ? parseInt(values.instagramAccountId) : undefined;
      // For Instagram, accountId might not be set, so we need to handle validation differently
      if (!baseData.instagramAccountId) {
        toast({
          title: "Missing Instagram Account",
          description: "Please select an Instagram account.",
          variant: "destructive",
        });
        return;
      }
    } else {
      baseData.accountId = parseInt(values.accountId);
      if (!baseData.accountId || isNaN(baseData.accountId)) {
        toast({
          title: "Missing Facebook Account",
          description: "Please select a Facebook page.",
          variant: "destructive",
        });
        return;
      }
    }

    // Determine action based on schedule toggle
    if (isScheduleEnabled) {
      console.log('🔍 SCHEDULE MODE ENABLED');
      
      if (!values.scheduledFor || !values.scheduledTime) {
        toast({
          title: "Missing Schedule Information",
          description: "Please select both date and time for scheduling.",
          variant: "destructive",
        });
        return;
      }
      
      // SCHEDULE ACTION - Create scheduled post
      const scheduledDate = new Date(values.scheduledFor);
      const [hours, minutes] = values.scheduledTime.split(':').map(Number);
      scheduledDate.setHours(hours, minutes, 0, 0);
      
      const now = new Date();
      console.log('🔍 Scheduled time:', scheduledDate.toISOString());
      console.log('🔍 Current time:', now.toISOString());
      
      if (scheduledDate > now) {
        const postData = {
          ...baseData,
          status: "scheduled",
          scheduledFor: scheduledDate.toISOString(),
        };
        console.log('📅 SCHEDULING POST:', postData);
        createPostMutation.mutate(postData);
      } else {
        toast({
          title: "Invalid Date",
          description: "Please select a future date and time.",
          variant: "destructive",
        });
      }
    } else {
      // PUBLISH NOW ACTION - Create immediate post
      console.log('🔍 IMMEDIATE MODE');
      const postData = {
        ...baseData,
        status: "immediate",
      };
      console.log('🚀 PUBLISHING IMMEDIATELY:', postData);
      createPostMutation.mutate(postData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Create post</DialogTitle>
          <DialogDescription>
            Create and schedule your Facebook post with advanced publishing options
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6 pb-6">
            {/* Platform Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Select Platform</h3>
              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Reset account selection when platform changes
                          form.setValue("accountId", "");
                          form.setValue("instagramAccountId", "");
                          form.setValue("snapchatAccountId", "");
                        }}
                        value={field.value}
                        className="flex gap-4 flex-wrap"
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-[120px]">
                          <RadioGroupItem value="facebook" id="facebook" />
                          <Label htmlFor="facebook" className="flex items-center gap-2 cursor-pointer">
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">f</span>
                            </div>
                            <span>Facebook</span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 flex-1 min-w-[120px]">
                          <RadioGroupItem value="instagram" id="instagram" />
                          <Label htmlFor="instagram" className="flex items-center gap-2 cursor-pointer">
                            <div className="w-6 h-6 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center">
                              <span className="text-white text-xs font-bold">📷</span>
                            </div>
                            <span>Instagram</span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 flex-1 min-w-[120px]">
                          <RadioGroupItem value="snapchat" id="snapchat" />
                          <Label htmlFor="snapchat" className="flex items-center gap-2 cursor-pointer">
                            <div className="w-6 h-6 bg-yellow-400 rounded-lg flex items-center justify-center">
                              <span className="text-black text-xs font-bold">👻</span>
                            </div>
                            <span>Snapchat</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Account Selection - Dynamic based on platform */}
            <div>
              <h3 className="text-lg font-semibold mb-3">
                {watchPlatform === "facebook" ? "Select Facebook Page" : 
                 watchPlatform === "instagram" ? "Select Instagram Account" : 
                 "Select Snapchat Account"}
              </h3>
              
              {watchPlatform === "facebook" ? (
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full h-12">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                <span className="text-white text-sm font-bold">f</span>
                              </div>
                              <SelectValue placeholder="Select a Facebook page" />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id.toString()}>
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
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
              ) : watchPlatform === "instagram" ? (
                <FormField
                  control={form.control}
                  name="instagramAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full h-12">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center">
                                <span className="text-white text-xs font-bold">📷</span>
                              </div>
                              <SelectValue placeholder="Select an Instagram account" />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {instagramAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id.toString()}>
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">📷</span>
                                </div>
                                @{account.username}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="snapchatAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full h-12">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
                                  <span className="text-black text-sm font-bold">👻</span>
                                </div>
                                <SelectValue placeholder="Select a Snapchat account" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {snapchatAccounts.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-gray-500">
                                No Snapchat accounts connected. Connect one in Settings.
                              </div>
                            ) : (
                              snapchatAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id.toString()}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 bg-yellow-400 rounded-lg flex items-center justify-center">
                                      <span className="text-black text-xs font-bold">👻</span>
                                    </div>
                                    {account.displayName}
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Snapchat Publish Type Selection */}
                  <FormField
                    control={form.control}
                    name="snapchatPublishType"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Publish Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select publish type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="story">Story (24 hours)</SelectItem>
                            <SelectItem value="spotlight">Spotlight (Viral Feed)</SelectItem>
                            <SelectItem value="saved_story">Saved Story (Permanent)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Media Section */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Media</h3>
              <p className="text-gray-600 text-sm mb-4">Share photos or a video.</p>
              
              <div className="flex gap-3 mb-4">
                <Button variant="outline" type="button" className="h-10 gap-2">
                  <Image className="w-4 h-4" />
                  Add Photo
                </Button>
                
                <Button variant="outline" type="button" className="h-10 gap-2">
                  <Video className="w-4 h-4" />
                  Add Video
                  <ChevronDown className="w-4 h-4" />
                </Button>
                
                <Button 
                  variant="outline" 
                  type="button" 
                  className="h-10 gap-2 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                  onClick={() => {
                    form.setValue("mediaType", "video");
                    form.setValue("mediaUrl", "");
                  }}
                >
                  🎥 YouTube Link
                </Button>
              </div>
              
              {/* Media Type Selection */}
              <FormField
                control={form.control}
                name="mediaType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media Type</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select media type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Media</SelectItem>
                          <SelectItem value="photo">Photo</SelectItem>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="reel">Reel</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Media URL Input with Cloud Storage Support */}
              {form.watch("mediaType") !== "none" && (
                <FormField
                  control={form.control}
                  name="mediaUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Media URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Paste YouTube URL or direct video link here..."
                          {...field}
                        />
                      </FormControl>
                      <div className="text-xs mt-1 space-y-1">
                        {/* URL Recognition Indicator */}
                        {field.value && (
                          <div className="flex items-center gap-2 p-2 rounded-md bg-gray-50">
                            {field.value.includes('youtube.com') || field.value.includes('youtu.be') ? (
                              <div className="flex items-center gap-1 text-red-600">
                                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                YouTube URL detected - Native Facebook integration (recommended)
                              </div>
                            ) : field.value.includes('vimeo.com') ? (
                              <div className="flex items-center gap-1 text-blue-600">
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                Vimeo URL detected - Requires download permissions
                              </div>
                            ) : field.value.match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v)(\?|$)/i) ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                Direct video URL detected - Optimal for Facebook upload
                              </div>
                            ) : field.value.includes('dropbox.com') ? (
                              <div className="flex items-center gap-1 text-amber-600">
                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                Dropbox URL detected - May have access limitations
                              </div>
                            ) : field.value.includes('drive.google.com') ? (
                              <div className="flex items-center gap-1 text-amber-600">
                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                Google Drive URL detected - May have limitations for large videos
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-gray-600">
                                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                                URL detected - Validating format...
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="text-gray-500 space-y-1">
                          <div><strong>✅ Best:</strong> YouTube links (native Facebook integration, no size limits)</div>
                          <div><strong>✅ Good:</strong> Direct video URLs (website hosting ending in .mp4)</div>
                          <div><strong>⚠️ Limited:</strong> Cloud storage links (access restrictions may apply)</div>
                        </div>
                        
                        {/* YouTube Setup Guide */}
                        {!field.value && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                            <div className="text-red-700 font-medium mb-1">YouTube Setup (Recommended):</div>
                            <div className="text-red-600 text-xs space-y-1">
                              <div>1. Upload video to YouTube (free account works)</div>
                              <div>2. Set privacy to "Public" or "Unlisted" (recommended)</div>
                              <div>3. Copy YouTube URL (youtube.com/watch?v=VIDEO_ID)</div>
                              <div>4. Works instantly - no file size limits or setup required</div>
                            </div>
                          </div>
                        )}
                        
                        {/* Alternative Solutions */}
                        {!field.value && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                            <div className="text-green-700 font-medium mb-1">Alternative Solutions:</div>
                            <div className="text-green-600 text-xs space-y-1">
                              <div><strong>Direct Hosting:</strong> Upload to website (URL ends in .mp4)</div>
                              <div><strong>Vimeo:</strong> Enable download permissions in settings</div>
                              <div><strong>WeTransfer:</strong> Generate direct download links</div>
                            </div>
                          </div>
                        )}
                        
                        {/* YouTube-specific guidance */}
                        {field.value && (field.value.includes('youtube.com') || field.value.includes('youtu.be')) && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                            <div className="text-red-700 text-xs">
                              <strong>YouTube Tip:</strong> Video will be downloaded and uploaded as actual file to Facebook. Supports large videos using resumable upload.
                            </div>
                          </div>
                        )}
                        
                        {/* Vimeo-specific guidance */}
                        {field.value && field.value.includes('vimeo.com') && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                            <div className="text-blue-700 text-xs">
                              <strong>Vimeo Tip:</strong> Ensure "Allow downloads" is enabled in your video settings for optimal Facebook upload compatibility.
                            </div>
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Post Details */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Post details</h3>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Text</Label>
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Textarea 
                              placeholder="What do you want to say?"
                              className="min-h-[100px] border-gray-200 resize-none pr-16"
                              {...field}
                            />
                            <div className="absolute bottom-3 right-3 flex gap-2">
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Hash className="w-4 h-4 text-gray-500" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Smile className="w-4 h-4 text-gray-500" />
                              </Button>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Action Icons */}
                <div className="flex gap-4 text-gray-500 items-center">
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Smile className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MapPin className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Users className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Image className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <TrendingUp className="w-5 h-5" />
                  </Button>
                  <FormField
                    control={form.control}
                    name="link"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input 
                            placeholder="Add link"
                            className="h-8 text-sm border-none bg-transparent"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Link2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200" />

            {/* Scheduling Options */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Scheduling options</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="schedule-toggle" className="text-sm">Set date and time</Label>
                  <Switch
                    id="schedule-toggle"
                    checked={isScheduleEnabled}
                    onCheckedChange={(checked) => {
                      console.log('🎯 TOGGLE CHANGED:', checked);
                      setIsScheduleEnabled(checked);
                      scheduleEnabledRef.current = checked;
                      console.log('🔄 STATE AND REF UPDATED:', checked);
                    }}
                  />
                </div>
              </div>
              
              <p className="text-gray-600 text-sm mb-4">
                Schedule your post for the times when your audience is most active, or manually select 
                a date and time in the future to publish your post.
              </p>

              {isScheduleEnabled && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">f</span>
                    </div>
                    <span className="font-medium">Facebook</span>
                  </div>

                  <div className="flex gap-4">
                    <FormField
                      control={form.control}
                      name="scheduledFor"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal h-12",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? (
                                    format(field.value, "d MMMM yyyy")
                                  ) : (
                                    <span>{format(new Date(), "d MMMM yyyy")}</span>
                                  )}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scheduledTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              type="time"
                              className="w-32 h-12"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button variant="outline" type="button" className="h-10 gap-2">
                    <div className="w-4 h-4 bg-gray-800 rounded-full"></div>
                    Active times
                  </Button>
                </div>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Language Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Language</h3>
              <p className="text-gray-600 text-sm mb-4">Select the language for your post content.</p>
              
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="it">Italian</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                        <SelectItem value="ru">Russian</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                        <SelectItem value="ko">Korean</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                        <SelectItem value="nl">Dutch</SelectItem>
                        <SelectItem value="sv">Swedish</SelectItem>
                        <SelectItem value="da">Danish</SelectItem>
                        <SelectItem value="no">Norwegian</SelectItem>
                        <SelectItem value="fi">Finnish</SelectItem>
                        <SelectItem value="pl">Polish</SelectItem>
                        <SelectItem value="tr">Turkish</SelectItem>
                        <SelectItem value="th">Thai</SelectItem>
                        <SelectItem value="vi">Vietnamese</SelectItem>
                        <SelectItem value="id">Indonesian</SelectItem>
                        <SelectItem value="ms">Malay</SelectItem>
                        <SelectItem value="tl">Filipino</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Custom Labels */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Labels</h3>
              <p className="text-gray-600 text-sm mb-4">Add labels to organize your content and track performance.</p>
              
              <FormField
                control={form.control}
                name="labels"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between h-12",
                              !field.value?.length && "text-muted-foreground"
                            )}
                          >
                            {field.value?.length
                              ? `${field.value.length} label${field.value.length > 1 ? "s" : ""} selected`
                              : "Select labels"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search labels..." />
                          <CommandEmpty>No labels found.</CommandEmpty>
                          <CommandGroup>
                            {(customLabels || []).map((label) => (
                              <CommandItem
                                key={label.id}
                                value={label.name}
                                onSelect={() => {
                                  const labelId = label.id.toString();
                                  const selectedLabels = field.value || [];
                                  const newLabels = selectedLabels.includes(labelId)
                                    ? selectedLabels.filter((id) => id !== labelId)
                                    : [...selectedLabels, labelId];
                                  field.onChange(newLabels);
                                }}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <Badge 
                                    style={{ backgroundColor: label.color }} 
                                    className="h-4 w-4 rounded-full p-0" 
                                  />
                                  <span className="flex-1">{label.name}</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      field.value?.includes(label.id.toString()) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Display selected labels */}
              {form.watch("labels")?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.watch("labels")?.map((labelId) => {
                    const label = (customLabels || []).find(l => l.id.toString() === labelId);
                    if (!label) return null;
                    return (
                      <Badge 
                        key={label.id} 
                        variant="secondary" 
                        className="flex items-center gap-1"
                        style={{ backgroundColor: label.color + '20', color: label.color }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name} <span className="opacity-60">(ID: {label.id})</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 ml-1"
                          onClick={() => {
                            const currentLabels = form.getValues("labels") || [];
                            const newLabels = currentLabels.filter(id => id !== labelId);
                            form.setValue("labels", newLabels);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Crosspost to Other Pages */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Crosspost to other pages</h3>
              <p className="text-gray-600 text-sm mb-4">Post the same content to multiple Facebook pages.</p>
              
              <FormField
                control={form.control}
                name="crosspost"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-medium">
                        Post the same content to multiple Facebook pages
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              
              {watchCrosspost && (
                <FormField
                  control={form.control}
                  name="crosspostTo"
                  render={({ field }) => (
                    <FormItem className="flex flex-col mt-4">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between h-12",
                                !field.value?.length && "text-muted-foreground"
                              )}
                            >
                              {field.value?.length
                                ? `${field.value.length} page${field.value.length > 1 ? "s" : ""} selected for crosspost`
                                : "Select additional pages"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                          <Command>
                            <CommandInput placeholder="Search pages..." />
                            <CommandEmpty>No additional pages found.</CommandEmpty>
                            <CommandGroup>
                              {accounts
                                .filter(account => account.id.toString() !== form.watch("accountId"))
                                .map((account) => (
                                <CommandItem
                                  key={account.id}
                                  value={account.name}
                                  onSelect={() => {
                                    const accountId = account.id.toString();
                                    const selectedPages = field.value || [];
                                    const newPages = selectedPages.includes(accountId)
                                      ? selectedPages.filter((id) => id !== accountId)
                                      : [...selectedPages, accountId];
                                    field.onChange(newPages);
                                  }}
                                >
                                  <div className="flex items-center gap-3 w-full">
                                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">f</span>
                                    </div>
                                    <span className="flex-1">{account.name}</span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4",
                                        field.value?.includes(account.id.toString()) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Collaborator */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold">Collaborator</h3>
                <div className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">i</span>
                </div>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Add a collaborator to your Facebook post and they will automatically be invited.
              </p>
              
              <FormField
                control={form.control}
                name="collaborator"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input 
                        placeholder="Add a collaborator by name or URL"
                        className="h-12"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Privacy Settings */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Privacy settings</h3>
              <p className="text-gray-600 text-sm mb-4">
                Adjust your privacy settings to control who can see your post in News Feed, in Watch, in 
                search results and on your profile.
              </p>
              
              <FormField
                control={form.control}
                name="privacy"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-3 p-3 border rounded-lg bg-blue-50 border-blue-200">
                          <RadioGroupItem value="public" id="public" />
                          <div className="flex items-center gap-3 flex-1">
                            <Globe className="w-5 h-5 text-blue-600" />
                            <div>
                              <Label htmlFor="public" className="font-medium">Public</Label>
                              <p className="text-sm text-gray-600">Anyone on or off Facebook will be able to see your post.</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="restricted" id="restricted" />
                          <div className="flex items-center gap-3 flex-1">
                            <Lock className="w-5 h-5 text-gray-600" />
                            <div>
                              <Label htmlFor="restricted" className="font-medium">Restricted</Label>
                              <p className="text-sm text-gray-600">Choose certain people on Facebook who can see your post.</p>
                            </div>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                <FormField
                  control={form.control}
                  name="boost"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="w-4 h-4"
                        />
                      </FormControl>
                      <Label className="text-sm font-medium">Boost</Label>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={onClose}
                  className="px-6"
                >
                  Cancel
                </Button>
                
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Save as draft without publishing
                    const values = form.getValues();
                    const draftValues = { ...values, status: 'draft' };
                    delete draftValues.scheduledTime;
                    
                    const postData = {
                      ...draftValues,
                      accountId: parseInt(draftValues.accountId),
                    };
                    
                    console.log('🚀 CLIENT: Saving as draft:', postData.status);
                    createPostMutation.mutate(postData);
                  }}
                  className="px-6"
                >
                  Finish later
                </Button>
                
                <Button 
                  type="submit"
                  disabled={createPostMutation.isPending}
                  className="px-6 bg-blue-600 hover:bg-blue-700"
                >
                  {isScheduleEnabled ? 'Schedule' : 'Publish Now'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}