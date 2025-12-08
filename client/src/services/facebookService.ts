import { z } from 'zod';

// Types for Facebook API responses
const FacebookPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  category: z.string().optional()
});

const FacebookPostResultSchema = z.object({
  id: z.string(),
  post_id: z.string().optional()
});

export type FacebookPage = z.infer<typeof FacebookPageSchema>;
export type FacebookPostResult = z.infer<typeof FacebookPostResultSchema>;

// Facebook API service
export const facebookService = {
  // Initialize with access token
  setup: (accessToken: string) => {
    return {
      // Get pages that the user has access to
      getPages: async (): Promise<FacebookPage[]> => {
        try {
          const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
          
          if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.data;
        } catch (error) {
          console.error('Error fetching Facebook pages:', error);
          throw error;
        }
      },
      
      // Create a text post
      createTextPost: async (pageId: string, pageAccessToken: string, message: string): Promise<FacebookPostResult> => {
        try {
          const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              access_token: pageAccessToken
            })
          });
          
          if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Error creating Facebook text post:', error);
          throw error;
        }
      },
      
      // Create a post with a link
      createLinkPost: async (pageId: string, pageAccessToken: string, message: string, link: string): Promise<FacebookPostResult> => {
        try {
          const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              link,
              access_token: pageAccessToken
            })
          });
          
          if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Error creating Facebook link post:', error);
          throw error;
        }
      },
      
      // Create a post with an image
      createImagePost: async (pageId: string, pageAccessToken: string, message: string, imageUrl: string): Promise<FacebookPostResult> => {
        try {
          // First, upload the image
          const uploadResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: imageUrl,
              published: false,
              access_token: pageAccessToken
            })
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Facebook API error on image upload: ${uploadResponse.status}`);
          }
          
          const uploadData = await uploadResponse.json();
          
          // Then create the post with the uploaded image
          const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              attached_media: [{ media_fbid: uploadData.id }],
              access_token: pageAccessToken
            })
          });
          
          if (!response.ok) {
            throw new Error(`Facebook API error on post creation: ${response.status}`);
          }
          
          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Error creating Facebook image post:', error);
          throw error;
        }
      },
      
      // Schedule a post
      schedulePost: async (pageId: string, pageAccessToken: string, post: {
        message: string;
        link?: string;
        imageUrl?: string;
        scheduledTime: Date;
      }): Promise<FacebookPostResult> => {
        try {
          const scheduledPublishTime = Math.floor(post.scheduledTime.getTime() / 1000);
          
          let endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
          let body: any = {
            message: post.message,
            published: false,
            scheduled_publish_time: scheduledPublishTime,
            access_token: pageAccessToken
          };
          
          // If it's an image post
          if (post.imageUrl) {
            // First, upload the image
            const uploadResponse = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: post.imageUrl,
                published: false,
                access_token: pageAccessToken
              })
            });
            
            if (!uploadResponse.ok) {
              throw new Error(`Facebook API error on image upload: ${uploadResponse.status}`);
            }
            
            const uploadData = await uploadResponse.json();
            body.attached_media = [{ media_fbid: uploadData.id }];
          }
          
          // If it's a link post
          if (post.link) {
            body.link = post.link;
          }
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
          });
          
          if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Error scheduling Facebook post:', error);
          throw error;
        }
      }
    };
  }
};
