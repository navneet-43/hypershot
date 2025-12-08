import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardHeader from "@/components/common/DashboardHeader";
import { FacebookPostCreator } from "@/components/common/FacebookPostCreator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PublishingCalendar() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // Ensure page is scrollable
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <>
      <DashboardHeader 
        title="Publishing Calendar" 
        subtitle="View and manage your scheduled content"
        showImport={true}
        importLabel="Create Post"
        onImport={() => setIsCreateDialogOpen(true)}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Publishing Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-solid fa-calendar-days text-5xl mb-4"></i>
                <p>Calendar view will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would display a calendar view of all scheduled posts.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  Create Post
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Facebook-style Post Creator */}
      <FacebookPostCreator 
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
      />
    </>
  );
}