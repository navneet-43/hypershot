import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PublishingHistory() {
  return (
    <>
      <DashboardHeader 
        title="Publishing History" 
        subtitle="View your past publications" 
        showImport={false}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Publishing History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-solid fa-clock-rotate-left text-5xl mb-4"></i>
                <p>Publishing history will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would display a list of all published posts with performance metrics.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
