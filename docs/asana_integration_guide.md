# Asana Integration Technical Guide

This document outlines the integration between our social media publishing tool and Asana, enabling users to import tasks from Asana projects and convert them into scheduled social media posts.

## Overview

The Asana integration allows users to:
1. Connect their Asana account via OAuth
2. Select workspaces and projects to import from
3. Map Asana task fields to social media post attributes
4. Import tasks as draft or scheduled posts
5. Maintain relationships between Asana tasks and social media posts
6. Receive updates when tasks change in Asana

## Prerequisites

To implement Asana integration, we need:

1. **Asana Developer Account**
   - Register at [developer.asana.com](https://developer.asana.com/)
   - Create an OAuth application

2. **Environment Variables**
   - `ASANA_CLIENT_ID`: OAuth client ID from Asana Developer Console
   - `ASANA_CLIENT_SECRET`: OAuth client secret from Asana Developer Console
   - `ASANA_REDIRECT_URI`: Callback URL for OAuth flow

3. **Database Models**
   - Asana integration storage in our database
   - Mapping configuration storage
   - Task-to-post relationship tracking

## Implementation Plan

### 1. Database Schema

The database schema includes tables for storing Asana integration data:

```typescript
// Asana Integration Table
export const asanaIntegrations = pgTable("asana_integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Asana Field Mapping Table
export const asanaFieldMappings = pgTable("asana_field_mappings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  asanaField: text("asana_field").notNull(), // e.g., "name", "notes", "due_date"
  postField: text("post_field").notNull(), // e.g., "content", "scheduledFor", "labels"
  createdAt: timestamp("created_at").defaultNow(),
});

// Post-Task Relationship
export const posts = pgTable("posts", {
  // ... existing fields
  asanaTaskId: text("asana_task_id"),
  asanaProjectId: text("asana_project_id"),
});
```

### 2. OAuth Authentication

The OAuth flow for Asana authentication:

```typescript
// Initiate OAuth flow
app.get('/api/asana/auth', isAuthenticated, (req: Request, res: Response) => {
  const authUrl = `https://app.asana.com/-/oauth_authorize?client_id=${process.env.ASANA_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.ASANA_REDIRECT_URI)}&response_type=code&state=${req.user.id}`;
  res.json({ authUrl });
});

// OAuth callback
app.get('/api/asana/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;
  const userId = parseInt(state as string, 10);
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://app.asana.com/-/oauth_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ASANA_CLIENT_ID,
        client_secret: process.env.ASANA_CLIENT_SECRET,
        redirect_uri: process.env.ASANA_REDIRECT_URI,
        code: code as string,
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Error obtaining Asana token');
    }
    
    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    
    // Store integration in database
    const existingIntegration = await storage.getAsanaIntegration(userId);
    
    if (existingIntegration) {
      await storage.updateAsanaIntegration(userId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      });
    } else {
      await storage.createAsanaIntegration({
        userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      });
    }
    
    // Create activity log
    await storage.createActivity({
      userId,
      type: 'asana_connected',
      description: 'Connected Asana account',
    });
    
    // Redirect to Asana integration page
    res.redirect('/asana-integration');
  } catch (error) {
    console.error('Asana OAuth error:', error);
    res.redirect('/asana-integration?error=' + encodeURIComponent((error as Error).message));
  }
});
```

### 3. Token Refresh Mechanism

```typescript
async function refreshAsanaToken(userId: number) {
  const integration = await storage.getAsanaIntegration(userId);
  
  if (!integration || !integration.refreshToken) {
    throw new Error('Asana integration not found or missing refresh token');
  }
  
  try {
    const response = await fetch('https://app.asana.com/-/oauth_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ASANA_CLIENT_ID,
        client_secret: process.env.ASANA_CLIENT_SECRET,
        refresh_token: integration.refreshToken,
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error_description || 'Error refreshing token');
    }
    
    // Calculate new expiration time
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);
    
    // Update the stored tokens
    await storage.updateAsanaIntegration(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    });
    
    return data.access_token;
  } catch (error) {
    // If refresh fails, require reconnection
    await storage.updateAsanaIntegration(userId, {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
    
    throw new Error('Asana authentication expired. Please reconnect your account.');
  }
}
```

### 4. Asana API Wrapper

A utility class to interact with Asana API:

```typescript
class AsanaClient {
  private userId: number;
  private baseUrl = 'https://app.asana.com/api/1.0';
  
  constructor(userId: number) {
    this.userId = userId;
  }
  
  private async getAccessToken() {
    const integration = await storage.getAsanaIntegration(this.userId);
    
    if (!integration) {
      throw new Error('Asana integration not found');
    }
    
    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (integration.expiresAt && integration.expiresAt.getTime() - now.getTime() < expirationBuffer) {
      // Token is expired or about to expire, refresh it
      return refreshAsanaToken(this.userId);
    }
    
    return integration.accessToken;
  }
  
  private async request(endpoint: string, method = 'GET', body?: any) {
    const accessToken = await this.getAccessToken();
    
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    if (response.status >= 400) {
      throw new Error(data.errors?.[0]?.message || 'Asana API error');
    }
    
    return data.data;
  }
  
  // Get user workspaces
  async getWorkspaces() {
    return this.request('/workspaces');
  }
  
  // Get projects in a workspace
  async getProjects(workspaceId: string) {
    return this.request(`/workspaces/${workspaceId}/projects`);
  }
  
  // Get tasks in a project
  async getTasks(projectId: string, params: Record<string, string> = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return this.request(`/projects/${projectId}/tasks?${queryParams}`);
  }
  
  // Get task details
  async getTask(taskId: string) {
    return this.request(`/tasks/${taskId}`);
  }
}
```

### 5. API Endpoints

Backend endpoints for Asana integration:

```typescript
// Get Asana integration status
app.get('/api/asana-integration', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req, res);
    const integration = await storage.getAsanaIntegration(user.id);
    
    if (!integration) {
      return res.json({ connected: false });
    }
    
    // If integration exists but we need workspace/project info
    let workspaceInfo = null;
    let projectInfo = null;
    
    if (integration.workspaceId) {
      const asanaClient = new AsanaClient(user.id);
      
      try {
        // Get workspace details
        const workspaces = await asanaClient.getWorkspaces();
        const workspace = workspaces.find((w: any) => w.gid === integration.workspaceId);
        
        if (workspace) {
          workspaceInfo = {
            id: workspace.gid,
            name: workspace.name,
          };
        }
        
        // Get project details if available
        if (integration.projectId) {
          const projects = await asanaClient.getProjects(integration.workspaceId);
          const project = projects.find((p: any) => p.gid === integration.projectId);
          
          if (project) {
            projectInfo = {
              id: project.gid,
              name: project.name,
            };
          }
        }
      } catch (error) {
        console.error('Error fetching Asana details:', error);
        // Don't fail the request, just log the error
      }
    }
    
    res.json({
      connected: true,
      workspace: workspaceInfo,
      project: projectInfo,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching Asana integration', 
      error: (error as Error).message 
    });
  }
});

// Get Asana workspaces
app.get('/api/asana/workspaces', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req, res);
    const asanaClient = new AsanaClient(user.id);
    
    const workspaces = await asanaClient.getWorkspaces();
    
    res.json({
      success: true,
      workspaces: workspaces.map((workspace: any) => ({
        id: workspace.gid,
        name: workspace.name,
      })),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching Asana workspaces', 
      error: (error as Error).message 
    });
  }
});

// Get Asana projects
app.get('/api/asana/workspaces/:workspaceId/projects', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const user = await authenticateUser(req, res);
    const asanaClient = new AsanaClient(user.id);
    
    const projects = await asanaClient.getProjects(workspaceId);
    
    res.json({
      success: true,
      projects: projects.map((project: any) => ({
        id: project.gid,
        name: project.name,
      })),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching Asana projects', 
      error: (error as Error).message 
    });
  }
});

// Update Asana integration settings
app.post('/api/asana-integration', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req, res);
    const { workspaceId, projectId } = req.body;
    
    const integration = await storage.getAsanaIntegration(user.id);
    
    if (!integration) {
      return res.status(400).json({ 
        success: false, 
        message: 'Asana integration not found. Please connect your Asana account first.' 
      });
    }
    
    await storage.updateAsanaIntegration(user.id, {
      workspaceId,
      projectId,
    });
    
    // Create activity log
    await storage.createActivity({
      userId: user.id,
      type: 'asana_settings_updated',
      description: 'Updated Asana integration settings',
      metadata: { workspaceId, projectId },
    });
    
    res.json({ 
      success: true, 
      message: 'Asana integration settings updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating Asana integration', 
      error: (error as Error).message 
    });
  }
});

// Import tasks from Asana
app.post('/api/import-from-asana', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req, res);
    const { mapping } = req.body;
    
    const integration = await storage.getAsanaIntegration(user.id);
    
    if (!integration || !integration.workspaceId || !integration.projectId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Asana integration not properly configured. Please select a workspace and project.' 
      });
    }
    
    const asanaClient = new AsanaClient(user.id);
    
    // Get tasks from the selected project
    const tasks = await asanaClient.getTasks(integration.projectId, {
      opt_fields: 'name,notes,due_on,completed,tags.name,custom_fields',
    });
    
    // Process tasks according to the mapping
    const importResults = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };
    
    for (const task of tasks) {
      try {
        // Skip completed tasks
        if (task.completed) {
          importResults.skipped++;
          continue;
        }
        
        // Apply field mapping
        const postData: any = {
          userId: user.id,
          status: 'draft', // Default to draft
          asanaTaskId: task.gid,
          asanaProjectId: integration.projectId,
        };
        
        // Map task fields to post fields based on user configuration
        for (const [asanaField, postField] of Object.entries(mapping)) {
          if (asanaField === 'name' && postField === 'content') {
            postData.content = task.name;
          } else if (asanaField === 'notes' && postField === 'content') {
            postData.content = task.notes;
          } else if (asanaField === 'due_on' && postField === 'scheduledFor') {
            if (task.due_on) {
              // Convert date string to Date object
              postData.scheduledFor = new Date(task.due_on);
              // If a due date is provided, mark as scheduled
              postData.status = 'scheduled';
            }
          } else if (asanaField === 'tags' && postField === 'labels') {
            if (task.tags && task.tags.length > 0) {
              // Get tag names
              const tagNames = task.tags.map((tag: any) => tag.name);
              
              // Check if we have matching custom labels
              const customLabels = await storage.getCustomLabels(user.id);
              const matchingLabels = customLabels
                .filter(label => tagNames.includes(label.name))
                .map(label => ({ id: label.id, name: label.name }));
              
              // Create new labels for any tag that doesn't have a matching label
              for (const tagName of tagNames) {
                if (!matchingLabels.some(label => label.name === tagName)) {
                  // Create a new label
                  const newLabel = await storage.createCustomLabel({
                    userId: user.id,
                    name: tagName,
                    color: getRandomColor(), // Helper function to generate a color
                  });
                  
                  matchingLabels.push({ id: newLabel.id, name: newLabel.name });
                }
              }
              
              postData.labels = matchingLabels;
            }
          }
          
          // Handle custom fields if needed
          // This would require more complex mapping logic
        }
        
        // Ensure we have content
        if (!postData.content) {
          throw new Error('Cannot import task without content');
        }
        
        // Check if a post already exists for this task
        const existingPosts = await storage.getPosts(user.id);
        const existingPost = existingPosts.find(post => post.asanaTaskId === task.gid);
        
        if (existingPost) {
          // Update existing post
          await storage.updatePost(existingPost.id, postData);
        } else {
          // Create new post
          await storage.createPost(postData);
        }
        
        importResults.success++;
      } catch (error) {
        console.error(`Error importing task ${task.gid}:`, error);
        importResults.failed++;
        importResults.errors.push(`Task ${task.name}: ${(error as Error).message}`);
      }
    }
    
    // Create activity log
    await storage.createActivity({
      userId: user.id,
      type: 'asana_import',
      description: `Imported ${importResults.success} tasks from Asana`,
      metadata: importResults,
    });
    
    res.json({
      success: true,
      message: `Successfully imported ${importResults.success} tasks`,
      results: importResults,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error importing from Asana', 
      error: (error as Error).message 
    });
  }
});
```

### 6. Frontend Components

#### Asana Integration Page

```jsx
export default function AsanaIntegration() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [fieldMapping, setFieldMapping] = useState({
    name: 'content',
    due_on: 'scheduledFor',
    tags: 'labels',
  });
  
  // Fetch integration status
  const { data: integration, isLoading, refetch } = useQuery({
    queryKey: ['/api/asana-integration'],
  });
  
  // Fetch workspaces if connected
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useQuery({
    queryKey: ['/api/asana/workspaces'],
    enabled: integration?.connected === true,
  });
  
  // Fetch projects if workspace selected
  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/asana/workspaces', selectedWorkspaceId, 'projects'],
    enabled: !!selectedWorkspaceId,
  });
  
  // Mutation for updating integration settings
  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/asana-integration', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({
        title: 'Settings Updated',
        description: 'Asana integration settings updated successfully',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });
  
  // Mutation for importing from Asana
  const importMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/import-from-asana', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: (data) => {
      toast({
        title: 'Import Successful',
        description: data.message,
      });
      
      // Refresh other data that might be affected
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
    onError: (error) => {
      toast({
        title: 'Import Failed',
        description: (error as Error).message || 'Failed to import from Asana',
        variant: 'destructive',
      });
    },
  });
  
  useEffect(() => {
    // Initialize selected values from integration data
    if (integration?.connected && integration.workspace) {
      setSelectedWorkspaceId(integration.workspace.id);
      
      if (integration.project) {
        setSelectedProjectId(integration.project.id);
      }
    }
  }, [integration]);
  
  const handleConnect = async () => {
    setIsConnecting(true);
    
    try {
      const response = await fetch('/api/asana/auth');
      const data = await response.json();
      
      if (data.authUrl) {
        // Redirect to Asana OAuth URL
        window.location.href = data.authUrl;
      }
    } catch (error) {
      toast({
        title: 'Connection Error',
        description: (error as Error).message || 'Failed to initiate Asana connection',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };
  
  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      workspaceId: selectedWorkspaceId,
      projectId: selectedProjectId,
    });
  };
  
  const handleImport = () => {
    setIsImporting(true);
    importMutation.mutate({ mapping: fieldMapping });
  };
  
  const handleFieldMappingChange = (asanaField: string, postField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [asanaField]: postField,
    }));
  };
  
  // Render component UI
  // ... render logic
}
```

## Data Flow

The data flow for Asana integration:

1. **User Authentication**
   - User connects their Asana account via OAuth
   - We store access tokens, refresh tokens, and expiration time

2. **Workspace/Project Selection**
   - User selects which workspace and project to import from
   - Settings are stored in the database

3. **Field Mapping Configuration**
   - User configures how Asana task fields map to post fields
   - Mappings are stored in the database

4. **Task Import Process**
   - System fetches tasks from the selected Asana project
   - Tasks are processed according to the field mapping
   - Posts are created or updated with corresponding task data
   - System maintains relationship between tasks and posts

5. **Syncing and Updates**
   - Manual import can be triggered by the user
   - Automatic sync could be scheduled as a background job

## Security Considerations

1. **Token Security**
   - Access tokens and refresh tokens are stored securely in the database
   - Tokens are never exposed to the client
   - All API requests to Asana are made server-side

2. **OAuth Best Practices**
   - State parameter is used to prevent CSRF attacks
   - HTTPS is used for all OAuth redirects
   - Token refresh is handled securely

3. **Data Access Control**
   - Users can only access Asana data from their own connected accounts
   - All API requests are authenticated
   - Field-level permissions ensure users only see appropriate data

## Error Handling

1. **Authentication Errors**
   - Failed OAuth flows redirect to error pages
   - Token expiration is handled gracefully with automatic refresh
   - Clear error messages guide users through reconnection

2. **API Errors**
   - Rate limiting respect with exponential backoff
   - Transient errors are retried
   - Permanent errors are logged and reported

3. **Import Failures**
   - Partial imports are handled with detailed reporting
   - Tasks that fail to import are identified with reasons
   - Users can retry failed imports

## Deployment Checklist

Before deploying Asana integration:

1. **Ensure Environment Variables**
   - `ASANA_CLIENT_ID`
   - `ASANA_CLIENT_SECRET`
   - `ASANA_REDIRECT_URI`

2. **Database Migrations**
   - Run migrations to create required tables
   - Ensure indexes are created for performance

3. **OAuth Configuration**
   - Verify redirect URIs in Asana Developer Console
   - Test authentication flow in staging environment

4. **Documentation**
   - Update user documentation with Asana integration instructions
   - Create troubleshooting guide for common issues

## Future Enhancements

1. **Bidirectional Sync**
   - Update Asana tasks when posts are modified
   - Sync post status back to Asana (published, scheduled, etc.)

2. **Webhook Integration**
   - Subscribe to Asana webhooks for real-time updates
   - Automatically update posts when tasks change

3. **Advanced Mapping**
   - Support for custom fields in Asana
   - More complex mapping options for rich text and media

4. **Bulk Operations**
   - Select specific tasks to import
   - Bulk update/delete operations

5. **Scheduling Optimization**
   - Use Asana due dates to suggest optimal posting times
   - Handle time zones and scheduling constraints

## Resources

- [Asana API Documentation](https://developers.asana.com/docs)
- [Asana OAuth Guide](https://developers.asana.com/docs/oauth)
- [Asana API Explorer](https://developers.asana.com/explorer)