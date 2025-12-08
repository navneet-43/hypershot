import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import AllPosts from "@/pages/AllPosts";
import PublishingCalendar from "@/pages/PublishingCalendar";
import PublishingHistory from "@/pages/PublishingHistory";
import FacebookAccounts from "@/pages/FacebookAccounts";
import InstagramAccounts from "@/pages/InstagramAccounts";
import SnapchatAccounts from "@/pages/SnapchatAccounts";
import InstagramCsvImport from "@/pages/InstagramCsvImport";
import GoogleSheetsIntegration from "@/pages/GoogleSheetsIntegration";
import ExcelImport from "@/pages/ExcelImport";
import CustomLabels from "@/pages/CustomLabels";
import Settings from "@/pages/Settings";
import ReportsPage from "@/pages/ReportsPage";
import Login from "@/pages/Login";

import Sidebar from "@/components/layout/Sidebar";
import MobileMenu from "@/components/layout/MobileMenu";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useState, useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/posts" component={AllPosts} />
      <Route path="/calendar" component={PublishingCalendar} />
      <Route path="/publishing-calendar" component={PublishingCalendar} />
      <Route path="/history" component={PublishingHistory} />
      <Route path="/facebook-accounts" component={FacebookAccounts} />
      <Route path="/instagram-accounts" component={InstagramAccounts} />
      <Route path="/snapchat-accounts" component={SnapchatAccounts} />
      <Route path="/instagram-csv-import" component={InstagramCsvImport} />
      <Route path="/google-sheets" component={GoogleSheetsIntegration} />
      <Route path="/excel-import" component={ExcelImport} />
      <Route path="/custom-labels" component={CustomLabels} />
      <Route path="/reports" component={ReportsPage} />

      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading, user } = usePlatformAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to login if not authenticated (except on login page)
    if (!isLoading && !isAuthenticated && location !== '/login') {
      setLocation('/login');
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated && location === '/login') {
    return <Login />;
  }

  // Show authenticated app
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
      
      <main className="flex-1 overflow-x-hidden overflow-y-auto md:pt-0 pt-16">
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white z-10 shadow-sm">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center">
              <div className="bg-fb-blue text-white p-2 rounded-lg">
                <i className="fa-solid fa-bolt-lightning"></i>
              </div>
              <h1 className="ml-3 text-xl font-bold">HyperShot</h1>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-600 hover:text-gray-800 p-2"
            >
              <i className="fa-solid fa-bars"></i>
            </button>
          </div>
        </div>
        
        <Router />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="*">
            {() => <AuthenticatedApp />}
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;