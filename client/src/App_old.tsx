import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import PublishingCalendar from "@/pages/PublishingCalendar";
import PublishingHistory from "@/pages/PublishingHistory";
import FacebookAccounts from "@/pages/FacebookAccounts";
import GoogleSheetsIntegration from "@/pages/GoogleSheetsIntegration";
import CustomLabels from "@/pages/CustomLabels";
import Settings from "@/pages/Settings";

import Sidebar from "@/components/layout/Sidebar";
import MobileMenu from "@/components/layout/MobileMenu";
import { useState } from "react";

function Router() {
  // Direct access to dashboard without authentication check
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={PublishingCalendar} />
      <Route path="/publishing-calendar" component={PublishingCalendar} />
      <Route path="/history" component={PublishingHistory} />
      <Route path="/facebook-accounts" component={FacebookAccounts} />
      <Route path="/google-sheets-integration" component={GoogleSheetsIntegration} />
      <Route path="/custom-labels" component={CustomLabels} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthenticatedApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check authentication status to conditionally show sidebar
  const { data: authStatus, isLoading } = useQuery({
    queryKey: ['/api/auth/status'],
    retry: false,
  });

  const isAuthenticated = authStatus?.isLoggedIn;

  return (
    <div className="flex min-h-screen">
      {/* Only show sidebar when authenticated */}
      {isAuthenticated && <Sidebar />}
      
      {isAuthenticated && (
        <MobileMenu 
          isOpen={isMobileMenuOpen} 
          onClose={() => setIsMobileMenuOpen(false)} 
        />
      )}
      
      <main className={`flex-1 overflow-x-hidden overflow-y-auto ${isAuthenticated ? 'md:pt-0 pt-16' : ''}`}>
        {isAuthenticated && (
          <div className="md:hidden fixed top-0 left-0 right-0 bg-white z-10 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center">
                <div className="bg-fb-blue text-white p-2 rounded-lg">
                  <i className="fa-solid fa-bolt-lightning"></i>
                </div>
                <h1 className="ml-3 text-xl font-bold">SocialFlow</h1>
              </div>
              <button 
                type="button" 
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <i className="fa-solid fa-bars"></i>
              </button>
            </div>
          </div>
        )}
        
        <Router />
      </main>
    </div>
  );
}

export default App;
