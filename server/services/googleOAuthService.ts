import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.REPLIT_DEV_DOMAIN}/api/google/callback`
);

export class GoogleOAuthService {
  /**
   * Generate Google OAuth authorization URL
   */
  static getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokens(code: string) {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Set credentials for API requests
   */
  static setCredentials(tokens: any) {
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  }

  /**
   * Get user's Google Drive spreadsheets
   */
  static async getUserSpreadsheets(accessToken: string) {
    const auth = this.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    try {
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 50
      });

      return response.data.files || [];
    } catch (error) {
      console.error('Error fetching spreadsheets:', error);
      throw error;
    }
  }

  /**
   * Get spreadsheet sheets/tabs
   */
  static async getSpreadsheetSheets(accessToken: string, spreadsheetId: string) {
    const auth = this.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      return response.data.sheets?.map(sheet => ({
        id: sheet.properties?.sheetId,
        title: sheet.properties?.title,
        rowCount: sheet.properties?.gridProperties?.rowCount,
        columnCount: sheet.properties?.gridProperties?.columnCount
      })) || [];
    } catch (error) {
      console.error('Error fetching sheet tabs:', error);
      throw error;
    }
  }

  /**
   * Import data from Google Sheets
   */
  static async importSheetData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    range: string = 'A:Z'
  ) {
    const auth = this.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!${range}`
      });

      const values = response.data.values || [];
      
      if (values.length === 0) {
        return [];
      }

      // Convert to objects using first row as headers
      const headers = values[0];
      const rows = values.slice(1);

      return rows.map((row: string[]) => {
        const rowObject: { [key: string]: string } = {};
        headers.forEach((header: string, index: number) => {
          rowObject[header] = row[index] || '';
        });
        return rowObject;
      });
    } catch (error) {
      console.error('Error importing sheet data:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken: string) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }
}