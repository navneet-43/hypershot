import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface FacebookTokenRefreshProps {
  accounts: Array<{
    id: number;
    name: string;
    pageId: string;
  }>;
  onRefreshComplete: () => void;
}

export function FacebookTokenRefresh({ accounts, onRefreshComplete }: FacebookTokenRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const handleTokenRefresh = async () => {
    setIsRefreshing(true);
    try {
      // First, redirect to Facebook OAuth to get new tokens
      window.location.href = '/auth/facebook';
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      toast({
        title: "Token Refresh Failed",
        description: "Failed to refresh Facebook tokens. Please try again.",
        variant: "destructive",
      });
      setIsRefreshing(false);
    }
  };

  const testFacebookConnection = async () => {
    try {
      const response = await apiRequest('/api/facebook-tokens/test');
      console.log('Facebook token test results:', response);
      
      toast({
        title: "Token Test Complete",
        description: "Check the console for detailed results.",
        variant: "default",
      });
    } catch (error) {
      console.error('Error testing tokens:', error);
      toast({
        title: "Token Test Failed", 
        description: "Failed to test Facebook tokens.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5" />
          Facebook Token Issue Detected
        </CardTitle>
        <CardDescription className="text-orange-700">
          Your Facebook access tokens appear to be expired or invalid. Posts cannot be published to Facebook until this is resolved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-orange-700">
          <p className="mb-2">Affected accounts:</p>
          <ul className="list-disc pl-4 space-y-1">
            {accounts.map(account => (
              <li key={account.id}>{account.name} (ID: {account.pageId})</li>
            ))}
          </ul>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleTokenRefresh}
            disabled={isRefreshing}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              'Refresh Facebook Connection'
            )}
          </Button>
          
          <Button 
            variant="outline"
            onClick={testFacebookConnection}
            className="border-orange-600 text-orange-600 hover:bg-orange-100"
          >
            Test Connection
          </Button>
        </div>
        
        <div className="text-xs text-orange-600">
          This will redirect you to Facebook to reauthorize the application with fresh tokens.
        </div>
      </CardContent>
    </Card>
  );
}