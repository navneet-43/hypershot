import { z } from 'zod';

// Types for Asana API responses
const AsanaProjectSchema = z.object({
  gid: z.string(),
  name: z.string(),
  resource_type: z.string()
});

const AsanaTaskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  resource_type: z.string(),
  completed: z.boolean().optional(),
  due_on: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignee: z.object({
    gid: z.string(),
    name: z.string()
  }).optional().nullable(),
  custom_fields: z.array(
    z.object({
      gid: z.string(),
      name: z.string(),
      type: z.string(),
      enum_value: z.object({
        gid: z.string(),
        name: z.string(),
        color: z.string().optional()
      }).optional().nullable(),
      text_value: z.string().optional().nullable(),
      number_value: z.number().optional().nullable()
    })
  ).optional()
});

export type AsanaProject = z.infer<typeof AsanaProjectSchema>;
export type AsanaTask = z.infer<typeof AsanaTaskSchema>;

// Asana API service
export const asanaService = {
  // Initialize with access token
  setup: (accessToken: string) => {
    return {
      // Get list of projects
      getProjects: async (): Promise<AsanaProject[]> => {
        try {
          const response = await fetch('https://app.asana.com/api/1.0/projects', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Asana API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.data;
        } catch (error) {
          console.error('Error fetching Asana projects:', error);
          throw error;
        }
      },
      
      // Get tasks from a project
      getTasks: async (projectId: string, options?: { completed_since?: string, due_on?: string }): Promise<AsanaTask[]> => {
        try {
          let url = `https://app.asana.com/api/1.0/projects/${projectId}/tasks?opt_fields=gid,name,resource_type,completed,due_on,notes,assignee,custom_fields`;
          
          if (options) {
            const params = new URLSearchParams();
            if (options.completed_since) params.append('completed_since', options.completed_since);
            if (options.due_on) params.append('due_on', options.due_on);
            if (params.toString()) url += `&${params.toString()}`;
          }
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Asana API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.data;
        } catch (error) {
          console.error('Error fetching Asana tasks:', error);
          throw error;
        }
      },
      
      // Get task details
      getTask: async (taskId: string): Promise<AsanaTask> => {
        try {
          const response = await fetch(`https://app.asana.com/api/1.0/tasks/${taskId}?opt_fields=gid,name,resource_type,completed,due_on,notes,assignee,custom_fields`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Asana API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.data;
        } catch (error) {
          console.error('Error fetching Asana task:', error);
          throw error;
        }
      }
    };
  },
  
  // Parse Asana tasks into FB posts based on field mapping
  parseTasksToFbPosts: (tasks: AsanaTask[], fieldMapping: Record<string, string>) => {
    return tasks.map(task => {
      // Extract post data based on field mapping
      const post = {
        content: task.name,
        scheduledFor: task.due_on ? new Date(task.due_on) : undefined,
        labels: [] as string[],
        language: 'English',
        status: 'draft',
        asanaTaskId: task.gid
      };
      
      // Process custom fields if available
      if (task.custom_fields) {
        task.custom_fields.forEach(field => {
          const mappingKey = fieldMapping[field.name.toLowerCase()];
          
          if (!mappingKey) return;
          
          if (mappingKey === 'content' && field.text_value) {
            post.content = field.text_value;
          } else if (mappingKey === 'scheduledFor' && field.text_value) {
            post.scheduledFor = new Date(field.text_value);
          } else if (mappingKey === 'labels' && field.enum_value) {
            post.labels.push(field.enum_value.name);
          } else if (mappingKey === 'language' && field.enum_value) {
            post.language = field.enum_value.name;
          }
        });
      }
      
      // Use notes as content if available and mapped
      if (fieldMapping['notes'] === 'content' && task.notes) {
        post.content = task.notes;
      }
      
      return post;
    });
  }
};
