import { Link, useLocation } from "wouter";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { LogOut } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = usePlatformAuth();
  const { toast } = useToast();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/platform/auth/logout', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Logout failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/auth/status'] });
      window.location.href = '/login';
    },
    onError: () => {
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <aside className="w-64 bg-white shadow-md hidden md:block">
      <div className="p-4 border-b border-fb-gray">
        <div className="flex items-center">
          <div className="bg-fb-blue text-white p-2 rounded-lg">
            <i className="fa-solid fa-bolt-lightning"></i>
          </div>
          <h1 className="ml-3 text-xl font-bold">HyperShot</h1>
        </div>
      </div>
      
      <nav className="mt-4">
        <div className="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Main
        </div>
        <Link href="/" className={`flex items-center px-4 py-3 ${isActive('/') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-dashboard w-5"></i>
          <span className="ml-3">Dashboard</span>
        </Link>
        <Link href="/calendar" className={`flex items-center px-4 py-3 ${isActive('/calendar') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-calendar w-5"></i>
          <span className="ml-3">Publishing Calendar</span>
        </Link>
        <Link href="/history" className={`flex items-center px-4 py-3 ${isActive('/history') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-clock-rotate-left w-5"></i>
          <span className="ml-3">Publishing History</span>
        </Link>
        <Link href="/reports" className={`flex items-center px-4 py-3 ${isActive('/reports') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-chart-bar w-5"></i>
          <span className="ml-3">Reports</span>
        </Link>
        
        <div className="px-4 mt-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Configuration
        </div>
        <Link href="/facebook-accounts" className={`flex items-center px-4 py-3 ${isActive('/facebook-accounts') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-brands fa-facebook w-5"></i>
          <span className="ml-3">Facebook Accounts</span>
        </Link>
        <Link href="/instagram-accounts" className={`flex items-center px-4 py-3 ${isActive('/instagram-accounts') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-brands fa-instagram w-5"></i>
          <span className="ml-3">Instagram Accounts</span>
        </Link>
        <Link href="/snapchat-accounts" className={`flex items-center px-4 py-3 ${isActive('/snapchat-accounts') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-brands fa-snapchat w-5"></i>
          <span className="ml-3">Snapchat Accounts</span>
        </Link>
        <Link href="/google-sheets-integration" className={`flex items-center px-4 py-3 ${isActive('/google-sheets-integration') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-table w-5"></i>
          <span className="ml-3">Google Sheets Integration</span>
        </Link>
        <Link href="/excel-import" className={`flex items-center px-4 py-3 ${isActive('/excel-import') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-file-excel w-5"></i>
          <span className="ml-3">Excel Import</span>
        </Link>

        <Link href="/custom-labels" className={`flex items-center px-4 py-3 ${isActive('/custom-labels') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-tag w-5"></i>
          <span className="ml-3">Custom Labels</span>
        </Link>
        <Link href="/settings" className={`flex items-center px-4 py-3 ${isActive('/settings') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-gear w-5"></i>
          <span className="ml-3">Settings</span>
        </Link>
      </nav>
      
      <div className="absolute bottom-0 w-64 border-t border-fb-gray p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 font-semibold text-sm">
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.fullName || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button 
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="text-gray-500 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors flex-shrink-0"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
