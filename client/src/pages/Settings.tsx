import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  return (
    <>
      <DashboardHeader 
        title="Settings" 
        subtitle="Configure application preferences" 
        showImport={false}
        showExport={false}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Application Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-solid fa-gears text-5xl mb-4"></i>
                <p>Settings page will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would allow you to configure global application settings.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
