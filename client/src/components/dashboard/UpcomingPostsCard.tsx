import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Edit2 } from "lucide-react";
import { useState } from "react";

interface Post {
  id: number;
  content: string;
  scheduledFor?: string;
  status: string;
  accountId: number;
  instagramAccountId?: number;
  platform?: string;
  labels?: string[];
  language?: string;
  mediaUrl?: string;
  link?: string;
}

interface FacebookAccount {
  id: number;
  name: string;
  pageId: string;
}

interface InstagramAccount {
  id: number;
  username: string;
  instagramBusinessAccountId: string;
}

export default function UpcomingPostsCard() {
  const { toast } = useToast();
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    content: '',
    language: '',
    labels: [] as string[],
    scheduledFor: ''
  });

  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ['/api/posts/upcoming'],
    refetchOnWindowFocus: true,
    staleTime: 0
  });

  const { data: facebookAccounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
  });

  const { data: instagramAccounts = [] } = useQuery<InstagramAccount[]>({
    queryKey: ['/api/instagram-accounts'],
  });

  const { data: customLabels = [] } = useQuery({
    queryKey: ['/api/custom-labels'],
    queryFn: () => apiRequest('/api/custom-labels'),
    retry: false,
    refetchOnWindowFocus: false
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/posts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: "Post deleted",
        description: "The post has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      // Clear all cache and force complete refresh
      queryClient.clear();
      // Force immediate refetch of upcoming posts
      queryClient.refetchQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.refetchQueries({ queryKey: ['/api/posts'] });
      queryClient.refetchQueries({ queryKey: ['/api/stats'] });
      queryClient.refetchQueries({ queryKey: ['/api/activities'] });
      setEditingPost(null);
      toast({
        title: "Post updated",
        description: "The post has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update post: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  // Helper function to format the date in IST
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    
    // Get current date in IST for comparison
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // Convert target date to IST for comparison
    const targetIST = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    
    // Check if it's today in IST
    if (targetIST.toDateString() === today.toDateString()) {
      return `Today, ${d.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      })}`;
    }
    
    // Check if it's tomorrow in IST
    if (targetIST.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${d.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      })}`;
    }
    
    // Otherwise return day of week + time in IST
    return `${d.toLocaleDateString('en-IN', { 
      weekday: 'short',
      timeZone: 'Asia/Kolkata'
    })}, ${d.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    })}`;
  };

  // Helper function to determine post icon
  const getPostIcon = (post: Post) => {
    if (post.mediaUrl) return "fa-image";
    if (post.link) return "fa-link";
    return "fa-font";
  };

  const startEditing = (post: Post) => {
    setEditingPost(post.id);
    const scheduledDate = post.scheduledFor ? new Date(post.scheduledFor) : new Date();
    
    // Convert UTC to IST for datetime-local input (browser expects local time format)
    const istTimeString = scheduledDate.toLocaleString('sv-SE', { 
      timeZone: 'Asia/Kolkata' 
    }); // 'sv-SE' locale gives YYYY-MM-DD HH:mm:ss format
    const formattedDate = istTimeString.slice(0, 16); // Remove seconds to get YYYY-MM-DDTHH:mm
    
    setEditData({
      content: post.content,
      language: post.language || 'English',
      labels: Array.isArray(post.labels) ? post.labels : [],
      scheduledFor: formattedDate
    });
  };

  const cancelEditing = () => {
    setEditingPost(null);
    setEditData({ content: '', language: '', labels: [], scheduledFor: '' });
  };

  const saveChanges = (postId: number) => {
    // CRITICAL: Frontend test shows backend API works perfectly
    // Issue must be in this frontend timezone conversion logic
    
    console.log('🚨 COMPREHENSIVE TIMEZONE DEBUG:');
    console.log('Raw input from datetime-local:', editData.scheduledFor);
    console.log('Input type:', typeof editData.scheduledFor);
    console.log('Input length:', editData.scheduledFor.length);
    console.log('Current browser time:', new Date().toString());
    console.log('Current UTC time:', new Date().toISOString());
    console.log('Current IST time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    
    // Let's try multiple conversion methods and compare
    console.log('--- CONVERSION METHOD COMPARISON ---');
    
    // Method 1: My current approach
    const [datePart, timePart] = editData.scheduledFor.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    const istDate = new Date(year, month - 1, day, hours, minutes);
    const method1Utc = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
    
    console.log('Method 1 - Manual parse IST:', istDate.toString());
    console.log('Method 1 - Converted to UTC:', method1Utc.toISOString());
    console.log('Method 1 - Hours from now:', (method1Utc.getTime() - Date.now()) / (1000 * 60 * 60));
    
    // Method 2: Direct parsing then subtract 5.5 hours
    const directParse = new Date(editData.scheduledFor);
    const method2Utc = new Date(directParse.getTime() - (5.5 * 60 * 60 * 1000));
    
    console.log('Method 2 - Direct parse:', directParse.toString());
    console.log('Method 2 - Converted to UTC:', method2Utc.toISOString());
    console.log('Method 2 - Hours from now:', (method2Utc.getTime() - Date.now()) / (1000 * 60 * 60));
    
    // Method 3: Parse as UTC then subtract
    const asUtcString = editData.scheduledFor + ':00.000Z';
    const parseAsUtc = new Date(asUtcString);
    const method3Utc = new Date(parseAsUtc.getTime() - (5.5 * 60 * 60 * 1000));
    
    console.log('Method 3 - Parse as UTC:', parseAsUtc.toString());
    console.log('Method 3 - Converted to UTC:', method3Utc.toISOString());
    console.log('Method 3 - Hours from now:', (method3Utc.getTime() - Date.now()) / (1000 * 60 * 60));
    
    // Use Method 3 (the correct one for IST→UTC conversion)
    const finalUtc = method3Utc;
    console.log('🎯 FINAL CHOICE - Using Method 3:', finalUtc.toISOString());
    
    updatePostMutation.mutate({
      id: postId,
      data: {
        content: editData.content,
        language: editData.language,
        labels: editData.labels,
        scheduledFor: finalUtc.toISOString()
      }
    });
  };

  const toggleLabel = (label: string) => {
    setEditData(prev => ({
      ...prev,
      labels: prev.labels.includes(label)
        ? prev.labels.filter(l => l !== label)
        : [...prev.labels, label]
    }));
  };

  const handleDelete = (postId: number) => {
    const post = posts?.find(p => p.id === postId);
    const confirmMessage = post 
      ? `Are you sure you want to delete this scheduled post?\n\nContent: "${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}"\nScheduled for: ${post.scheduledFor ? formatDate(post.scheduledFor) : 'Not scheduled'}\n\nThis action cannot be undone.`
      : "Are you sure you want to delete this post?";
    
    if (confirm(confirmMessage)) {
      deletePostMutation.mutate(postId);
    }
  };

  const getLabelColorClass = (label: string) => {
    const labelColors: Record<string, string> = {
      'Fashion': 'bg-blue-100 text-blue-800',
      'Blog': 'bg-green-100 text-green-800',
      'Promotion': 'bg-red-100 text-red-800',
      'News': 'bg-yellow-100 text-yellow-800',
      'Event': 'bg-indigo-100 text-indigo-800',
    };
    
    return labelColors[label] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow col-span-1 lg:col-span-2">
        <div className="px-6 py-5 border-b border-fb-gray flex justify-between items-center">
          <h3 className="text-lg font-semibold">Upcoming Posts</h3>
          <div className="flex">
            <Button variant="ghost" size="icon" className="mr-2">
              <i className="fa-solid fa-filter"></i>
            </Button>
            <Button variant="ghost" size="icon">
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </Button>
          </div>
        </div>
        
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array(3).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded" />
                        <div className="ml-4">
                          <Skeleton className="h-4 w-40 mb-2" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 w-24 ml-2" />
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-5 w-5" />
                        <Skeleton className="h-5 w-5" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow col-span-1 lg:col-span-2">
      <div className="px-6 py-5 border-b border-fb-gray flex justify-between items-center">
        <h3 className="text-lg font-semibold">Upcoming Posts</h3>
        <div className="flex">
          <Button variant="ghost" size="icon" className="mr-2">
            <i className="fa-solid fa-filter"></i>
          </Button>
          <Button variant="ghost" size="icon">
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts && posts.length > 0 ? (
                posts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                          <i className={`fa-solid ${getPostIcon(post)} text-gray-400`}></i>
                        </div>
                        <div className="ml-4 flex-1">
                          {editingPost === post.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editData.content}
                                onChange={(e) => setEditData(prev => ({ ...prev, content: e.target.value }))}
                                className="text-sm"
                                placeholder="Post content..."
                              />
                              <div className="flex flex-wrap gap-1 items-center">
                                <input
                                  type="datetime-local"
                                  value={editData.scheduledFor}
                                  onChange={(e) => setEditData(prev => ({ ...prev, scheduledFor: e.target.value }))}
                                  className="h-6 text-xs border border-gray-300 rounded px-2"
                                />
                                <Select
                                  value={editData.language}
                                  onValueChange={(value) => setEditData(prev => ({ ...prev, language: value }))}
                                >
                                  <SelectTrigger className="w-24 h-6 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="English">English</SelectItem>
                                    <SelectItem value="Tamil">Tamil</SelectItem>
                                    <SelectItem value="Hindi">Hindi</SelectItem>
                                    <SelectItem value="Spanish">Spanish</SelectItem>
                                  </SelectContent>
                                </Select>
                                {Array.isArray(customLabels) && customLabels.map((label: any) => (
                                  <Badge
                                    key={label.id}
                                    variant={editData.labels.includes(label.name) ? "default" : "outline"}
                                    className="h-6 text-xs cursor-pointer"
                                    onClick={() => toggleLabel(label.name)}
                                  >
                                    {label.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{post.content}</div>
                              <div className="text-xs text-gray-500 flex flex-wrap gap-1 mt-1">
                                {post.labels && Array.isArray(post.labels) && post.labels.map((label, index) => (
                                  <span key={index} className={`${getLabelColorClass(label)} text-xs font-medium px-2 py-0.5 rounded`}>{label}</span>
                                ))}
                                <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded">{post.language}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {post.platform === 'instagram' ? (
                          <>
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-tr from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center text-white">
                              <i className="fa-brands fa-instagram"></i>
                            </div>
                            <div className="ml-2">
                              <div className="text-sm text-gray-900">@{instagramAccounts.find(acc => acc.id === post.instagramAccountId)?.username || 'unknown ig account'}</div>
                              <div className="text-xs text-gray-500">Instagram</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-fb-blue flex items-center justify-center text-white">
                              <i className="fa-brands fa-facebook-f"></i>
                            </div>
                            <div className="ml-2">
                              <div className="text-sm text-gray-900">{facebookAccounts.find(acc => acc.id === post.accountId)?.name || 'Unknown Account'}</div>
                              <div className="text-xs text-gray-500">Page ID: {facebookAccounts.find(acc => acc.id === post.accountId)?.pageId || 'N/A'}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{post.scheduledFor ? formatDate(post.scheduledFor) : 'Not scheduled'}</div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      {post.status === 'scheduled' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Scheduled
                        </span>
                      )}
                      {post.status === 'draft' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                          Draft
                        </span>
                      )}
                      {post.status === 'published' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Published
                        </span>
                      )}
                      {post.status === 'failed' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-2">
                        {editingPost === post.id ? (
                          <>
                            <button 
                              className="p-1 rounded hover:bg-green-50 text-green-600 hover:text-green-700" 
                              onClick={() => saveChanges(post.id)}
                              title="Save Changes"
                              disabled={updatePostMutation.isPending}
                            >
                              {updatePostMutation.isPending ? (
                                <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button 
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" 
                              onClick={cancelEditing}
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" 
                              onClick={() => startEditing(post)}
                              title="Edit Post"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600" 
                              onClick={() => handleDelete(post.id)}
                              title="Delete Post"
                              disabled={deletePostMutation.isPending}
                            >
                              {deletePostMutation.isPending ? (
                                <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                              ) : (
                                <i className="fa-solid fa-trash text-sm"></i>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500">
                    No upcoming posts found. Import content from Asana or create new posts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-center mt-4">
          <Button 
            variant="link" 
            className="text-fb-blue"
            onClick={() => window.location.href = '/posts'}
          >
            View All Scheduled Posts
            <i className="fa-solid fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </div>
    </div>
  );
}
