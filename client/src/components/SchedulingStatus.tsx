import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SchedulingStatus {
  system: {
    isActive: boolean;
    checkInterval: number;
    isProcessing: boolean;
  };
  overduePosts: number;
  scheduledPosts: number;
  lastCheck: string;
  scheduledPostsList: Array<{
    id: number;
    content: string;
    scheduledFor: string;
    status: string;
  }>;
}

export function SchedulingStatus() {
  const queryClient = useQueryClient();
  
  const { data: status, isLoading } = useQuery({
    queryKey: ['/api/scheduling-status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const forceCheckMutation = useMutation({
    mutationFn: () => apiRequest('/api/force-check-posts', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
  });

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduling System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const schedulingStatus = status as SchedulingStatus;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Scheduling System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              {schedulingStatus?.system.isActive ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <Badge 
                variant={schedulingStatus?.system.isActive ? "default" : "destructive"}
                className="text-xs"
              >
                {schedulingStatus?.system.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">System Status</p>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {schedulingStatus?.scheduledPosts || 0}
            </div>
            <p className="text-sm text-muted-foreground">Scheduled Posts</p>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {schedulingStatus?.overduePosts || 0}
            </div>
            <p className="text-sm text-muted-foreground">Overdue Posts</p>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {schedulingStatus?.system.checkInterval}s
            </div>
            <p className="text-sm text-muted-foreground">Check Interval</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Last checked: {schedulingStatus?.lastCheck ? 
              new Date(schedulingStatus.lastCheck).toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true 
              }) + ' IST' : 'Never'}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => forceCheckMutation.mutate()}
            disabled={forceCheckMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${forceCheckMutation.isPending ? 'animate-spin' : ''}`} />
            Force Check
          </Button>
        </div>

        {schedulingStatus?.overduePosts > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">
                {schedulingStatus.overduePosts} posts are overdue for publishing
              </span>
            </div>
            <p className="text-sm text-orange-700 mt-1">
              These posts will be published automatically within the next check cycle (30 seconds).
            </p>
          </div>
        )}

        {schedulingStatus?.system.isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="font-medium">Processing scheduled posts...</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}