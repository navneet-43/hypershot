import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Calendar, Download, Filter, ExternalLink, CheckCircle, XCircle, Clock, CalendarIcon } from 'lucide-react';
import { format, parseISO, isValid, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';

interface ReportPost {
  id: number;
  platform: 'facebook' | 'instagram';
  content: string;
  createdAt: string;
  publishedAt: string | null;
  status: 'scheduled' | 'published' | 'failed';
  errorMessage: string | null;
  labels: string[];
  language: string;
  mediaType: string | null;
  accountName: string;
  pageId: string;
  facebookPostId: string | null;
}

interface ReportFilters {
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  status: 'all' | 'published' | 'failed' | 'scheduled';
  account: string;
  contentBucket: string;
  postType: string;
  platform: string;
  customStartDate?: Date;
  customEndDate?: Date;
}

export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: 'all',
    status: 'all',
    account: 'all',
    contentBucket: 'all',
    postType: 'all',
    platform: 'all'
  });

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Ensure scroll isn't blocked when popover is open
  useEffect(() => {
    const enableScroll = () => {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };

    if (datePickerOpen) {
      enableScroll();
      // Also ensure scroll after a slight delay
      const timer = setTimeout(enableScroll, 50);
      return () => clearTimeout(timer);
    }
  }, [datePickerOpen]);

  const [searchTerm, setSearchTerm] = useState('');

  // Fetch posts data for reports
  const { data: posts = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/reports/posts', filters, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== 'all' && key !== 'customStartDate' && key !== 'customEndDate') {
          params.append(key, value as string);
        }
      });
      
      // Handle custom date range
      if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
        params.append('startDate', filters.customStartDate.toISOString());
        params.append('endDate', filters.customEndDate.toISOString());
      }
      
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/reports/posts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch reports');
      return response.json();
    }
  });

  // Fetch Facebook accounts for filter dropdown
  const { data: fbAccounts = [] } = useQuery({
    queryKey: ['/api/facebook-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/facebook-accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json();
    }
  });

  // Fetch Instagram accounts for filter dropdown
  const { data: igAccounts = [] } = useQuery({
    queryKey: ['/api/instagram-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/instagram-accounts');
      if (!response.ok) throw new Error('Failed to fetch Instagram accounts');
      return response.json();
    }
  });

  // Combine accounts for display with platform indicator
  const accounts = [
    ...fbAccounts.map((acc: any) => ({ ...acc, platform: 'facebook', displayName: `📘 ${acc.name}` })),
    ...igAccounts.map((acc: any) => ({ ...acc, platform: 'instagram', displayName: `📸 ${acc.username || acc.name}` }))
  ];

  // Fetch custom labels for content bucket filter
  const { data: customLabels = [] } = useQuery({
    queryKey: ['/api/custom-labels'],
    queryFn: async () => {
      const response = await fetch('/api/custom-labels');
      if (!response.ok) throw new Error('Failed to fetch custom labels');
      return response.json();
    }
  });

  // Get unique content buckets from posts
  const contentBuckets = Array.from(new Set(
    posts.flatMap((post: ReportPost) => post.labels || [])
  )).filter(Boolean);

  // Since filtering is done on backend, just use posts directly
  const filteredPosts = posts;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return '-';
      
      // Convert to IST and format
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }) + ' IST';
    } catch {
      return '-';
    }
  };

  const getStatusBadge = (status: string, errorMessage: string | null) => {
    switch (status) {
      case 'published':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Published</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'scheduled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPublishedLink = (facebookPostId: string | null, pageId: string) => {
    if (!facebookPostId) return '-';
    const url = `https://facebook.com/${facebookPostId}`;
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        View Post <ExternalLink className="w-3 h-3" />
      </a>
    );
  };

  const getPostType = (mediaType: string | null, content: string) => {
    if (!mediaType) return 'Text';
    
    const type = mediaType.toLowerCase();
    if (type.includes('reel')) return 'Reel';
    if (type.includes('video')) return 'Video';
    if (type.includes('image') || type.includes('photo')) return 'Photo';
    return 'Text';
  };

  const getPostTypeBadge = (postType: string) => {
    const typeMap = {
      'Text': { color: 'bg-gray-100 text-gray-800', icon: '📝' },
      'Photo': { color: 'bg-blue-100 text-blue-800', icon: '📷' },
      'Video': { color: 'bg-purple-100 text-purple-800', icon: '🎥' },
      'Reel': { color: 'bg-green-100 text-green-800', icon: '🎬' }
    };
    
    const config = typeMap[postType as keyof typeof typeMap] || typeMap['Text'];
    return (
      <Badge variant="secondary" className={`${config.color} text-xs`}>
        {config.icon} {postType}
      </Badge>
    );
  };

  const getPlatformBadge = (platform: string) => {
    const platformConfig = {
      'facebook': { color: 'bg-blue-100 text-blue-800', icon: '📘', label: 'Facebook' },
      'instagram': { color: 'bg-pink-100 text-pink-800', icon: '📸', label: 'Instagram' }
    };
    
    const config = platformConfig[platform as keyof typeof platformConfig] || platformConfig['facebook'];
    return (
      <Badge variant="secondary" className={`${config.color} text-xs`}>
        {config.icon} {config.label}
      </Badge>
    );
  };

  const handleDateRangeChange = (preset: string) => {
    const now = new Date();
    
    switch (preset) {
      case 'today':
        setFilters(prev => ({ ...prev, dateRange: 'today' }));
        break;
      case 'week':
        setFilters(prev => ({ ...prev, dateRange: 'week' }));
        break;
      case 'month':
        setFilters(prev => ({ ...prev, dateRange: 'month' }));
        break;
      case 'custom':
        setFilters(prev => ({ 
          ...prev, 
          dateRange: 'custom',
          customStartDate: subDays(now, 7),
          customEndDate: now
        }));
        setDatePickerOpen(true);
        break;
      default:
        setFilters(prev => ({ ...prev, dateRange: 'all' }));
    }
  };

  const handleCustomDateChange = (startDate: Date | undefined, endDate: Date | undefined) => {
    setFilters(prev => ({
      ...prev,
      customStartDate: startDate,
      customEndDate: endDate
    }));
  };

  const getDateRangeText = () => {
    switch (filters.dateRange) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      case 'custom':
        if (filters.customStartDate && filters.customEndDate) {
          return `${format(filters.customStartDate, 'MMM dd')} - ${format(filters.customEndDate, 'MMM dd, yyyy')}`;
        }
        return 'Custom Range';
      default:
        return 'All Time';
    }
  };

  const escapeCSVField = (field: string | null | undefined): string => {
    if (field === null || field === undefined) return '""';
    const stringField = String(field);
    return `"${stringField.replace(/"/g, '""')}"`;
  };

  const exportToCsv = () => {
    const headers = ['Date Uploaded', 'Date Published', 'Platform', 'Published Page', 'Content Bucket', 'Post Type', 'Published Link', 'Content', 'Status'];
    const csvData = [
      headers.map(h => escapeCSVField(h)),
      ...filteredPosts.map((post: ReportPost) => [
        escapeCSVField(formatDate(post.createdAt)),
        escapeCSVField(formatDate(post.publishedAt)),
        escapeCSVField(post.platform === 'facebook' ? 'Facebook' : 'Instagram'),
        escapeCSVField(post.accountName),
        escapeCSVField((post.labels || []).join(', ')),
        escapeCSVField(getPostType(post.mediaType, post.content)),
        escapeCSVField(post.facebookPostId ? `https://facebook.com/${post.facebookPostId}` : ''),
        escapeCSVField(post.content),
        escapeCSVField(post.status)
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `publishing-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = {
    total: filteredPosts.length,
    published: filteredPosts.filter((p: ReportPost) => p.status === 'published').length,
    failed: filteredPosts.filter((p: ReportPost) => p.status === 'failed').length,
    scheduled: filteredPosts.filter((p: ReportPost) => p.status === 'scheduled').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Publishing Reports</h1>
          <p className="text-gray-600">Track your content publishing performance and analytics</p>
        </div>
        <Button onClick={exportToCsv} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Posts</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Published</p>
                <p className="text-2xl font-bold text-green-600">{stats.published}</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scheduled</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.scheduled}</p>
              </div>
              <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            <div>
              <label className="text-sm font-medium">Date Range</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {getDateRangeText()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-auto p-0" 
                  align="start" 
                  side="bottom" 
                  sideOffset={4} 
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onInteractOutside={(e) => {
                    // Allow interaction with page elements outside the popover
                    e.preventDefault();
                  }}
                >
                  <div className="flex">
                    {/* Left sidebar with presets */}
                    <div className="w-48 p-4 border-r border-gray-200 space-y-2">
                      <div className="space-y-1">
                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                            filters.dateRange === 'today' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            handleDateRangeChange('today');
                            setDatePickerOpen(false);
                          }}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            filters.dateRange === 'today' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          } flex items-center justify-center`}>
                            {filters.dateRange === 'today' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span>Today</span>
                        </div>
                        
                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                            filters.dateRange === 'week' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            handleDateRangeChange('week');
                            setDatePickerOpen(false);
                          }}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            filters.dateRange === 'week' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          } flex items-center justify-center`}>
                            {filters.dateRange === 'week' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span>Last 7 days</span>
                        </div>

                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                            filters.dateRange === 'month' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            handleDateRangeChange('month');
                            setDatePickerOpen(false);
                          }}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            filters.dateRange === 'month' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          } flex items-center justify-center`}>
                            {filters.dateRange === 'month' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span>Last 30 days</span>
                        </div>

                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                            filters.dateRange === 'custom' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                          onClick={() => handleDateRangeChange('custom')}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            filters.dateRange === 'custom' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          } flex items-center justify-center`}>
                            {filters.dateRange === 'custom' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span>Custom</span>
                        </div>

                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                            filters.dateRange === 'all' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            handleDateRangeChange('all');
                            setDatePickerOpen(false);
                          }}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            filters.dateRange === 'all' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          } flex items-center justify-center`}>
                            {filters.dateRange === 'all' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span>All Time</span>
                        </div>
                      </div>
                    </div>

                    {/* Right side with dual calendar for custom dates */}
                    {filters.dateRange === 'custom' && (
                      <div className="p-4">
                        <CalendarComponent
                          mode="range"
                          selected={{
                            from: filters.customStartDate,
                            to: filters.customEndDate
                          }}
                          onSelect={(range) => {
                            if (range) {
                              handleCustomDateChange(range.from, range.to);
                            }
                          }}
                          numberOfMonths={2}
                          className="rounded-md"
                        />
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <div className="text-xs text-gray-500">
                            {filters.customStartDate && filters.customEndDate ? (
                              `${format(filters.customStartDate, 'dd MMM yyyy')} - ${format(filters.customEndDate, 'dd MMM yyyy')}`
                            ) : filters.customStartDate ? (
                              `${format(filters.customStartDate, 'dd MMM yyyy')} - Select end date`
                            ) : (
                              'Select date range'
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDatePickerOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setDatePickerOpen(false)}
                              disabled={!filters.customStartDate || !filters.customEndDate}
                            >
                              Update
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={filters.status} onValueChange={(value: any) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Account</label>
              <Select value={filters.account} onValueChange={(value: any) => setFilters(prev => ({ ...prev, account: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account: any) => (
                    <SelectItem key={`${account.platform}-${account.id}`} value={`${account.platform}-${account.id}`}>
                      {account.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Content Bucket</label>
              <Select value={filters.contentBucket} onValueChange={(value: any) => setFilters(prev => ({ ...prev, contentBucket: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buckets</SelectItem>
                  {contentBuckets.map((bucket) => (
                    <SelectItem key={bucket as string} value={bucket as string}>
                      {bucket as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Post Type</label>
              <Select value={filters.postType} onValueChange={(value: any) => setFilters(prev => ({ ...prev, postType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="text">📝 Text</SelectItem>
                  <SelectItem value="photo">📷 Photo</SelectItem>
                  <SelectItem value="video">🎥 Video</SelectItem>
                  <SelectItem value="reel">🎬 Reel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Platform</label>
              <Select value={filters.platform} onValueChange={(value: any) => setFilters(prev => ({ ...prev, platform: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="facebook">📘 Facebook</SelectItem>
                  <SelectItem value="instagram">📸 Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Search Content</label>
              <Input
                placeholder="Search posts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Publishing Bucket Report</CardTitle>
          <CardDescription>
            Detailed report showing upload dates, publish dates, pages, content buckets, and published links
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Uploaded</TableHead>
                    <TableHead>Date Published</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Published Page</TableHead>
                    <TableHead>Content Bucket</TableHead>
                    <TableHead>Post Type</TableHead>
                    <TableHead>Published Link</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Failure Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        No posts found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPosts.map((post: ReportPost) => (
                      <TableRow key={post.id}>
                        <TableCell className="font-medium">
                          {formatDate(post.createdAt)}
                        </TableCell>
                        <TableCell>
                          {post.status === 'published' ? formatDate(post.publishedAt) : '-'}
                        </TableCell>
                        <TableCell>
                          {getPlatformBadge(post.platform)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{post.accountName}</span>
                            <span className="text-xs text-gray-500">{post.language.toUpperCase()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(post.labels || []).length > 0 ? (
                              post.labels.map((label, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {label}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getPostTypeBadge(getPostType(post.mediaType, post.content))}
                        </TableCell>
                        <TableCell>
                          {getPublishedLink(post.facebookPostId, post.pageId)}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={post.content}>
                            {post.content}
                          </div>
                          {post.mediaType && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {post.mediaType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(post.status, post.errorMessage)}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {post.status === 'failed' && post.errorMessage ? (
                            <div className="text-red-600 text-sm" title={post.errorMessage}>
                              <span className="line-clamp-2">{post.errorMessage}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}