import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsData {
  scheduled: number;
  publishedToday: number;
  accounts: number;
  failed: number;
}

export default function StatsCards() {
  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ['/api/stats'],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32 mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm">Scheduled Posts</div>
            <div className="text-2xl font-bold mt-1">{data?.scheduled || 0}</div>
          </div>
          <div className="bg-blue-100 text-fb-blue p-3 rounded-full">
            <i className="fa-solid fa-clock text-xl"></i>
          </div>
        </div>
        <div className="text-fb-blue text-sm mt-4">
          <span className="font-medium">Upcoming</span> posts
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm">Published Today</div>
            <div className="text-2xl font-bold mt-1">{data?.publishedToday || 0}</div>
          </div>
          <div className="bg-green-100 text-fb-green p-3 rounded-full">
            <i className="fa-solid fa-check-circle text-xl"></i>
          </div>
        </div>
        <div className="text-fb-green text-sm mt-4">
          <span className="font-medium">Today's</span> publications
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm">Active FB Accounts</div>
            <div className="text-2xl font-bold mt-1">{data?.accounts || 0}</div>
          </div>
          <div className="bg-purple-100 text-purple-600 p-3 rounded-full">
            <i className="fa-brands fa-facebook text-xl"></i>
          </div>
        </div>
        <div className="text-purple-600 text-sm mt-4">
          <span className="font-medium">Connected</span> accounts
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-500 text-sm">Failed Posts</div>
            <div className="text-2xl font-bold mt-1">{data?.failed || 0}</div>
          </div>
          <div className="bg-red-100 text-fb-error p-3 rounded-full">
            <i className="fa-solid fa-triangle-exclamation text-xl"></i>
          </div>
        </div>
        <div className="text-fb-error text-sm mt-4">
          {data?.failed ? (
            <span className="font-medium">Needs attention</span>
          ) : (
            <span className="font-medium">No issues</span>
          )}
        </div>
      </div>
    </div>
  );
}
