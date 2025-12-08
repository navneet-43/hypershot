import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function FacebookOAuthInstructions() {
  const [appDomain, setAppDomain] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    // Get the current hostname
    const host = window.location.host;
    const protocol = window.location.protocol;
    const domain = host.split('.').slice(-2).join('.');
    
    // Generate URLs for Facebook configuration
    setAppDomain(domain);
    setSiteUrl(`${protocol}//${host}`);
    setRedirectUri(`${protocol}//${host}/auth/facebook/callback`);
  }, []);

  return (
    <Alert className="my-4 border-blue-600">
      <AlertTitle className="text-lg font-semibold">Facebook App Configuration</AlertTitle>
      <AlertDescription>
        <p className="mt-2 mb-3">
          Before Facebook OAuth login works correctly, you need to add the following values to your Facebook App settings:
        </p>
        
        <div className="space-y-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
          <div>
            <span className="font-semibold">App Domain:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{appDomain}</code>
          </div>
          
          <div>
            <span className="font-semibold">Site URL:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{siteUrl}</code>
          </div>
          
          <div>
            <span className="font-semibold">Valid OAuth Redirect URI:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{redirectUri}</code>
          </div>
        </div>
        
        <div className="mt-3 mb-1">
          <span className="font-semibold">Required Permissions:</span>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>email</li>
            <li>pages_show_list</li>
            <li>pages_manage_posts</li>
            <li>pages_read_engagement</li>
          </ul>
        </div>
        
        <Button 
          variant="link" 
          className="p-0 h-auto mt-2 text-blue-600 dark:text-blue-400"
          onClick={() => window.open("https://developers.facebook.com/apps/", "_blank")}
        >
          Go to Facebook Developers
        </Button>
      </AlertDescription>
    </Alert>
  );
}