# Google Sheets Integration Guide

## Overview

The Google Sheets integration allows users to import content from their Google Sheets spreadsheets to create Facebook posts. This integration provides an easy way for content teams to manage their social media content in a familiar spreadsheet interface and then import it into the FB Publisher platform.

## Integration Features

1. **OAuth Authentication**: Secure connection to Google Sheets using OAuth 2.0
2. **Spreadsheet Selection**: Ability to choose from available Google Sheets
3. **Field Mapping**: Customizable mapping between spreadsheet columns and post fields
4. **Scheduled Imports**: Option to automatically import content on a schedule
5. **Batch Import**: Import multiple posts at once from selected spreadsheets

## Setup Instructions

### 1. Connect Your Google Account

1. Navigate to **Google Sheets Integration** in the sidebar
2. Click the **Connect to Google Sheets** button
3. Complete the Google OAuth authentication process
4. Grant necessary permissions for the application to access your Google Sheets

### 2. Configure Integration Settings

1. Select a spreadsheet from your Google Drive
2. Configure field mappings to match your spreadsheet structure:
   - **Content**: The column containing the post content (required)
   - **Schedule Date**: The column containing the date to publish the post
   - **Labels**: The column containing post labels/categories (comma-separated)
   - **Language**: The column containing the post language
   - **Link**: The column containing any links to include with the post
3. Save your settings

### 3. Import Content

After configuring the integration, you can import content:

1. Navigate to the **Dashboard**
2. Click the **Import from Google Sheets** button
3. Select your configured spreadsheet and sheet
4. Choose a date range for posts to import
5. Click **Import Content**

## Data Format Requirements

For successful imports, your Google Sheets spreadsheet should:

1. Have a header row with column names
2. Include at least one column for post content
3. Format dates as YYYY-MM-DD or MM/DD/YYYY
4. Separate multiple labels with commas
5. Include full URLs with http:// or https:// for links

## Example Spreadsheet Structure

| Content | ScheduleDate | Labels | Language | Link |
|---------|--------------|--------|----------|------|
| Check out our new product! | 2023-05-15 | Product, Announcement | English | https://example.com/product |
| Flash sale today only! | 2023-05-20 | Promotion, Sale | English | https://example.com/sale |
| ¡Nueva colección de verano! | 2023-05-25 | Collection, Seasonal | Spanish | https://example.com/es/summer |

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Ensure you're signed in to the correct Google account
   - Re-authorize the application if needed
   - Check if your Google account has access to the selected spreadsheet

2. **Import Failures**
   - Verify your spreadsheet follows the required data format
   - Ensure date formats are consistent
   - Check for special characters that might cause issues

3. **Missing Spreadsheets**
   - Ensure the spreadsheet is accessible to your Google account
   - Move the spreadsheet to a location accessible to the integration
   - If using a shared spreadsheet, ensure you have at least view access

### Getting Help

If you continue to experience issues with the Google Sheets integration, please:

1. Check the error messages for specific guidance
2. Refer to the [Google Sheets API documentation](https://developers.google.com/sheets/api/guides/concepts)
3. Contact support with details about the issue you're experiencing

## Best Practices

1. **Spreadsheet Organization**
   - Keep spreadsheets organized with clear headers
   - Create separate sheets for different campaigns or content types
   - Use data validation to ensure consistent formatting

2. **Content Planning**
   - Plan content in advance using the spreadsheet
   - Include all necessary metadata (labels, language, etc.)
   - Use cell comments in Google Sheets for collaboration

3. **Regular Imports**
   - Establish a regular schedule for importing content
   - Verify imported content on the calendar before publishing
   - Use custom labels to organize imported content