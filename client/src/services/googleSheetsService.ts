// Google Sheets API service
export const googleSheetsService = {
  // Initialize with access token
  setup: (accessToken: string) => {
    return {
      // Get list of spreadsheets
      getSpreadsheets: async (): Promise<GoogleSheetsSpreadsheet[]> => {
        try {
          const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application/vnd.google-apps.spreadsheet%27&fields=files(id,name)', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Google Sheets API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.files.map((file: any) => ({
            id: file.id,
            name: file.name
          }));
        } catch (error) {
          console.error('Error fetching Google Sheets spreadsheets:', error);
          throw error;
        }
      },
      
      // Get sheets from a spreadsheet
      getSheets: async (spreadsheetId: string): Promise<GoogleSheetsSheet[]> => {
        try {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Google Sheets API error: ${response.status}`);
          }
          
          const data = await response.json();
          return data.sheets.map((sheet: any) => ({
            id: sheet.properties.sheetId,
            name: sheet.properties.title
          }));
        } catch (error) {
          console.error('Error fetching Google Sheets sheets:', error);
          throw error;
        }
      },
      
      // Get data from a sheet
      getSheetData: async (spreadsheetId: string, sheetName: string): Promise<GoogleSheetsRow[]> => {
        try {
          const range = `${sheetName}!A1:Z1000`;
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`Google Sheets API error: ${response.status}`);
          }
          
          const data = await response.json();
          
          // Process the data with headers as keys
          const rows: GoogleSheetsRow[] = [];
          if (data.values && data.values.length > 1) {
            const headers = data.values[0];
            for (let i = 1; i < data.values.length; i++) {
              const rowData: Record<string, string> = {};
              const rowValues = data.values[i];
              
              // Map headers to values
              headers.forEach((header: string, index: number) => {
                rowData[header] = index < rowValues.length ? rowValues[index] : '';
              });
              
              // Add row index for reference
              rows.push({
                rowId: `row${i}`,
                data: rowData
              });
            }
          }
          
          return rows;
        } catch (error) {
          console.error('Error fetching Google Sheets data:', error);
          throw error;
        }
      }
    };
  },
  
  // Parse Google Sheets rows into FB posts based on field mapping
  parseRowsToFbPosts: (rows: GoogleSheetsRow[], fieldMapping: Record<string, string>) => {
    return rows.map(row => {
      const post: Partial<FbPost> = {
        content: row.data[fieldMapping.content] || '',
        sheetRowId: row.rowId
      };
      
      // Map other fields based on the mapping
      if (fieldMapping.scheduledFor && row.data[fieldMapping.scheduledFor]) {
        post.scheduledFor = new Date(row.data[fieldMapping.scheduledFor]);
      }
      
      if (fieldMapping.labels && row.data[fieldMapping.labels]) {
        post.labels = row.data[fieldMapping.labels].split(',').map(label => label.trim());
      }
      
      if (fieldMapping.language && row.data[fieldMapping.language]) {
        post.language = row.data[fieldMapping.language];
      }
      
      if (fieldMapping.link && row.data[fieldMapping.link]) {
        post.link = row.data[fieldMapping.link];
      }
      
      return post;
    });
  }
};

// Types
export interface GoogleSheetsSpreadsheet {
  id: string;
  name: string;
}

export interface GoogleSheetsSheet {
  id: string;
  name: string;
}

export interface GoogleSheetsRow {
  rowId: string;
  data: Record<string, string>;
}

interface FbPost {
  content: string;
  scheduledFor?: Date;
  status?: string;
  labels?: string[];
  language?: string;
  link?: string;
  sheetRowId?: string;
}