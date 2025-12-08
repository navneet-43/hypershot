import type { Express, Request, Response } from "express";
import { GoogleOAuthService } from "../services/googleOAuthService";
import { storage } from "../storage";

export function setupGoogleOAuthRoutes(app: Express) {
  // Initiate Google OAuth flow
  app.get('/api/google/auth', async (req: Request, res: Response) => {
    try {
      const authUrl = GoogleOAuthService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  });

  // Handle Google OAuth callback
  app.get('/api/google/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).redirect('/?error=oauth_cancelled');
    }

    try {
      const tokens = await GoogleOAuthService.getTokens(code as string);
      
      // Store tokens in session or database
      // For now, we'll store in the Google Sheets integration
      const user = { id: 3 }; // Default user for demo
      
      await storage.createOrUpdateGoogleSheetsIntegration({
        userId: user.id,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || null,
        folderId: null,
        spreadsheetId: null
      });

      // Redirect back to dashboard with success
      res.redirect('/?google_connected=true');
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      res.redirect('/?error=oauth_error');
    }
  });

  // Get user's Google Sheets
  app.get('/api/google/spreadsheets', async (req: Request, res: Response) => {
    try {
      const user = { id: 3 }; // Default user for demo
      const integration = await storage.getGoogleSheetsIntegration(user.id);

      if (!integration || !integration.accessToken) {
        return res.status(401).json({ error: 'Google account not connected' });
      }

      const spreadsheets = await GoogleOAuthService.getUserSpreadsheets(integration.accessToken);
      res.json({ spreadsheets });
    } catch (error) {
      console.error('Error fetching spreadsheets:', error);
      res.status(500).json({ error: 'Failed to fetch spreadsheets' });
    }
  });

  // Get sheets within a spreadsheet
  app.get('/api/google/spreadsheets/:id/sheets', async (req: Request, res: Response) => {
    try {
      const { id: spreadsheetId } = req.params;
      const user = { id: 3 }; // Default user for demo
      const integration = await storage.getGoogleSheetsIntegration(user.id);

      if (!integration || !integration.accessToken) {
        return res.status(401).json({ error: 'Google account not connected' });
      }

      const sheets = await GoogleOAuthService.getSpreadsheetSheets(integration.accessToken, spreadsheetId);
      res.json({ sheets });
    } catch (error) {
      console.error('Error fetching sheets:', error);
      res.status(500).json({ error: 'Failed to fetch sheets' });
    }
  });

  // Import data from specific sheet
  app.post('/api/google/import', async (req: Request, res: Response) => {
    try {
      const { spreadsheetId, sheetName, range = 'A:Z', accountId } = req.body;
      const user = { id: 3 }; // Default user for demo

      if (!spreadsheetId || !sheetName || !accountId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const integration = await storage.getGoogleSheetsIntegration(user.id);
      if (!integration || !integration.accessToken) {
        return res.status(401).json({ error: 'Google account not connected' });
      }

      // Import data using Google OAuth service
      const sheetData = await GoogleOAuthService.importSheetData(
        integration.accessToken,
        spreadsheetId,
        sheetName,
        range
      );

      if (!sheetData || sheetData.length === 0) {
        return res.status(400).json({ error: 'No data found in the specified sheet' });
      }

      // Create posts from imported data
      let postsCreated = 0;
      for (const row of sheetData) {
        try {
          // Skip empty rows
          if (!row.Content && !row.content) {
            continue;
          }

          // Extract post data from row
          const postData = extractPostData(row, user.id, parseInt(accountId));
          
          if (postData.content) {
            const post = await storage.createPost(postData);
            postsCreated++;
            console.log(`Created post ${post.id}: ${postData.content.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error('Error creating post from row:', error);
        }
      }

      res.json({
        success: true,
        message: `Successfully imported ${postsCreated} posts from Google Sheets`,
        postsCreated
      });

    } catch (error) {
      console.error('Error importing from Google Sheets:', error);
      res.status(500).json({ error: 'Failed to import from Google Sheets' });
    }
  });

  // Disconnect Google account
  app.delete('/api/google/disconnect', async (req: Request, res: Response) => {
    try {
      const user = { id: 3 }; // Default user for demo
      
      // Remove Google Sheets integration
      await storage.updateGoogleSheetsIntegration(user.id, {
        accessToken: '',
        refreshToken: null,
        folderId: null,
        spreadsheetId: null
      });

      res.json({ success: true, message: 'Google account disconnected' });
    } catch (error) {
      console.error('Error disconnecting Google account:', error);
      res.status(500).json({ error: 'Failed to disconnect Google account' });
    }
  });
}

// Helper function to extract post data from sheet row
function extractPostData(row: { [key: string]: string }, userId: number, accountId: number) {
  const content = row.Content || row.content || row.MESSAGE || row.message || '';
  const mediaUrl = row.MediaURL || row.mediaUrl || row.MEDIA_URL || row.media_url || 
                  row.ImageURL || row.imageUrl || row.IMAGE_URL || row.image_url || '';
  const mediaType = row.MediaType || row.mediaType || row.MEDIA_TYPE || row.media_type || 'none';
  const link = row.Link || row.link || row.URL || row.url || '';
  const language = row.Language || row.language || row.LANGUAGE || 'en';
  const scheduledFor = row.ScheduledFor || row.scheduledFor || row.SCHEDULED_FOR || 
                      row.scheduled_for || row.Date || row.date || row.DATE || '';
  const labels = row.Labels || row.labels || row.LABELS || row.Tags || row.tags || row.TAGS || '';

  // Parse labels (comma-separated)
  const parsedLabels = labels ? labels.split(',').map(l => l.trim()).filter(l => l) : [];

  // Parse scheduled date
  let parsedScheduledDate: Date | undefined;
  let status = 'draft';

  if (scheduledFor) {
    try {
      parsedScheduledDate = new Date(scheduledFor);
      if (parsedScheduledDate && !isNaN(parsedScheduledDate.getTime())) {
        if (parsedScheduledDate > new Date()) {
          status = 'scheduled';
        } else {
          status = 'draft';
        }
      }
    } catch (error) {
      console.warn('Invalid date format in sheet:', scheduledFor);
    }
  }

  // Determine media type from URL if not specified
  let finalMediaType = mediaType;
  if (mediaUrl && finalMediaType === 'none') {
    if (mediaUrl.includes('drive.google.com')) {
      finalMediaType = 'photo';
    }
  }

  return {
    userId,
    accountId,
    content,
    mediaUrl: mediaUrl || null,
    mediaType: finalMediaType,
    link: link || null,
    language,
    labels: parsedLabels,
    scheduledFor: parsedScheduledDate,
    status,
    sheetRowId: null,
    errorMessage: null
  };
}