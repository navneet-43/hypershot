import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";



export default function RecentActivityCard() {
  const [, setLocation] = useLocation();
  const { data: activities, isLoading } = useQuery<Activity[]>({
    queryKey: ['/api/activities'],
    retry: 1,
    retryDelay: 1000,
  });

  // Helper function to format the date
  // Server stores time in IST, so we display as-is without additional conversion
  const formatTime = (date: string | Date) => {
    // Parse the date - if it's an ISO string with Z, the server sent UTC
    // We need to display in IST
    let d: Date;
    
    if (typeof date === 'string') {
      // Check if it has timezone info
      if (date.endsWith('Z') || date.includes('+')) {
        // Has timezone - parse normally and convert to IST
        d = new Date(date);
      } else {
        // No timezone - treat as IST directly (add IST offset for correct parsing)
        d = new Date(date + '+05:30');
      }
    } else {
      d = new Date(date);
    }
    
    // Format in IST
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    };
    
    // Get today in IST for comparison
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const targetStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
    // If it's today in IST
    if (targetStr === todayStr) {
      return `Today, ${d.toLocaleTimeString('en-IN', timeOptions)}`;
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (targetStr === yesterdayStr) {
      return `Yesterday, ${d.toLocaleTimeString('en-IN', timeOptions)}`;
    }
    
    // Otherwise show the date
    return d.toLocaleDateString('en-IN', { 
      month: 'short', 
      day: 'numeric',
      timeZone: 'Asia/Kolkata'
    }) + ', ' + d.toLocaleTimeString('en-IN', timeOptions);
  };

  // Helper function to get icon and color for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post_published':
        return { icon: 'fa-check', bgColor: 'bg-green-100', textColor: 'text-fb-green' };
      case 'asana_import':
      case 'asana_connected':
        return { icon: 'fa-file-import', bgColor: 'bg-blue-100', textColor: 'text-fb-blue' };
      case 'post_failed':
        return { icon: 'fa-triangle-exclamation', bgColor: 'bg-red-100', textColor: 'text-fb-error' };
      case 'account_connected':
        return { icon: 'fa-link', bgColor: 'bg-purple-100', textColor: 'text-purple-600' };
      case 'post_created':
      case 'post_updated':
        return { icon: 'fa-pencil', bgColor: 'bg-indigo-100', textColor: 'text-indigo-600' };
      case 'account_removed':
      case 'post_deleted':
        return { icon: 'fa-trash', bgColor: 'bg-red-100', textColor: 'text-fb-error' };
      default:
        return { icon: 'fa-info-circle', bgColor: 'bg-gray-100', textColor: 'text-gray-600' };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-6 py-5 border-b border-fb-gray">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        
        <CardContent className="px-6 py-5">
          <ul className="divide-y divide-gray-200">
            {Array(3).fill(0).map((_, i) => (
              <li key={i} className="py-3">
                <div className="flex items-start">
                  <Skeleton className="h-8 w-8 rounded-full mt-1" />
                  <div className="ml-3 flex-1">
                    <Skeleton className="h-4 w-40 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          
          <div className="mt-4 text-center">
            <Skeleton className="h-4 w-32 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-6 py-5 border-b border-fb-gray">
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      
      <CardContent className="px-6 py-5">
        <ul className="divide-y divide-gray-200">
          {activities && activities.length > 0 ? (
            activities.map((activity) => {
              const { icon, bgColor, textColor } = getActivityIcon(activity.type);
              return (
                <li key={activity.id} className="py-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-1">
                      <div className={`h-8 w-8 rounded-full ${bgColor} flex items-center justify-center ${textColor}`}>
                        <i className={`fa-solid ${icon}`}></i>
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-900 flex-1">{activity.description}</p>
                        {/* Show status badge for post publishing activities */}
                        {activity.type === 'post_published' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                            <i className="fa-solid fa-check-circle mr-1"></i>
                            Published
                          </span>
                        )}
                        {activity.type === 'post_failed' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap">
                            <i className="fa-solid fa-times-circle mr-1"></i>
                            Failed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <p className="text-xs text-gray-500">{activity.createdAt ? formatTime(activity.createdAt) : ''}</p>
                        
                        {/* Show username for admin viewing all users' activities */}
                        {(activity as any).username && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            <i className="fa-solid fa-user mr-1"></i>
                            {(activity as any).username}
                          </span>
                        )}
                        
                        {/* Show platform indicator */}
                        {activity.metadata && (activity.metadata as any)?.platform && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            (activity.metadata as any).platform === 'facebook' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-pink-100 text-pink-700'
                          }`}>
                            <i className={`fa-brands fa-${(activity.metadata as any).platform} mr-1`}></i>
                            {(activity.metadata as any).platform === 'facebook' ? 'Facebook' : 'Instagram'}
                          </span>
                        )}
                        
                        {activity.metadata && (activity.type === 'post_published' || activity.type === 'bulk_import') && (
                          <>
                            {(activity.metadata as any)?.language && (
                              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium text-xs">
                                {String((activity.metadata as any).language).toUpperCase()}
                              </span>
                            )}
                            {(activity.metadata as any)?.customLabels && Array.isArray((activity.metadata as any).customLabels) && (activity.metadata as any).customLabels.length > 0 && (
                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium text-xs">
                                {((activity.metadata as any).customLabels as string[]).join(', ')}
                              </span>
                            )}
                            {(activity.metadata as any)?.labels && (activity.metadata as any).labels.trim() !== '' && (
                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium text-xs">
                                {String((activity.metadata as any).labels)}
                              </span>
                            )}
                            {(activity.metadata as any)?.mediaType && (activity.metadata as any).mediaType !== 'none' && (
                              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium text-xs">
                                {String((activity.metadata as any).mediaType)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="py-4 text-center text-sm text-gray-500">
              No recent activity found.
            </li>
          )}
        </ul>
        
        <div className="mt-4 text-center">
          <Button 
            variant="link" 
            className="text-fb-blue"
            onClick={() => setLocation('/posts')}
            data-testid="button-view-all-activity"
          >
            View All Activity
            <i className="fa-solid fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
