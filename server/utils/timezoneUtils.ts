/**
 * Timezone Conversion Utilities
 * Provides consistent IST to UTC conversion across all post creation methods
 */

/**
 * Converts a date from IST (Indian Standard Time) to UTC
 * IST is UTC+5:30, so we subtract 5 hours 30 minutes to get UTC
 * 
 * @param istDate - Date object representing time in IST
 * @returns Date object representing the same moment in UTC
 */
export function convertISTToUTC(istDate: Date): Date {
  // IST is UTC+5:30, so subtract 5.5 hours to get UTC
  const utcTime = istDate.getTime() - (5.5 * 60 * 60 * 1000);
  return new Date(utcTime);
}

/**
 * Parses a date string and converts it from IST to UTC
 * Handles various date formats and ensures consistent timezone conversion
 * 
 * @param dateString - Date string in IST timezone
 * @param rowContext - Optional context for logging (e.g., "Row 5")
 * @returns Date object in UTC timezone
 */
export function parseISTDateToUTC(dateString: string, rowContext?: string): Date {
  const context = rowContext || 'Date parsing';
  
  let istDate: Date;
  
  // Handle various date formats
  const dateStr = dateString.toString().trim();
  
  // Format: "2024-07-24 14:30:00" or "2024-07-24 14:30"
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoMatch) {
    const [, year, month, day, hours, minutes, seconds = '0'] = isoMatch;
    istDate = new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day), 
      parseInt(hours), 
      parseInt(minutes), 
      parseInt(seconds)
    );
    console.log(`${context}: Parsed YYYY-MM-DD format: ${dateStr}`);
  }
  // Format: "2:30 PM" - time only, use today's date
  else if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
    const today = new Date();
    const timeStr = dateStr.toUpperCase();
    let [time, period] = timeStr.split(/\s+/);
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    istDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
    console.log(`${context}: Parsed time-only format: ${dateStr}`);
  }
  // Format: "7/24/2024 2:30 PM" or "28/07/2025 15:05:00"
  else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)?$/i)) {
    const parts = dateStr.split(/\s+/).filter(p => p.length > 0);
    const [datePart, timePart, period] = parts;
    const dateParts = datePart.split('/').map(Number);
    const timeParts = timePart.split(':').map(Number);
    let [hours, minutes, seconds = 0] = timeParts;
    
    // Handle AM/PM
    if (period) {
      if (hours > 12) {
        console.log(`${context}: Invalid format "${timePart} ${period}" - treating as 24-hour format`);
      } else {
        if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }
    }
    
    // Determine DD/MM/YYYY vs MM/DD/YYYY
    let month, day, year;
    if (dateParts[0] > 12) {
      [day, month, year] = dateParts;
      console.log(`${context}: Detected DD/MM/YYYY format`);
    } else if (dateParts[1] > 12) {
      [month, day, year] = dateParts;
      console.log(`${context}: Detected MM/DD/YYYY format`);
    } else {
      [day, month, year] = dateParts;
      console.log(`${context}: Ambiguous date, using DD/MM/YYYY format`);
    }
    
    istDate = new Date(year, month - 1, day, hours, minutes, seconds);
    console.log(`${context}: Parsed slash format: ${dateStr}`);
  }
  // Format: "7-24-2024 2:30 PM"
  else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)?$/i)) {
    const parts = dateStr.split(/\s+/);
    const [datePart, timePart, period] = parts;
    const [month, day, year] = datePart.split('-').map(Number);
    const timeParts = timePart.split(':').map(Number);
    let [hours, minutes, seconds = 0] = timeParts;
    
    if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
    
    istDate = new Date(year, month - 1, day, hours, minutes, seconds);
    console.log(`${context}: Parsed dash format: ${dateStr}`);
  }
  // Fallback to standard Date parsing
  else {
    istDate = new Date(dateStr);
    console.log(`${context}: Used fallback Date parsing for: ${dateStr}`);
  }
  
  // Validate the parsed date
  if (isNaN(istDate.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  // Convert IST to UTC
  const utcDate = convertISTToUTC(istDate);
  
  console.log(`${context}: IST input: ${dateStr}`);
  console.log(`${context}: Local IST date: ${istDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`${context}: Converted to UTC: ${utcDate.toISOString()}`);
  
  return utcDate;
}

/**
 * Converts a UTC date back to IST for display purposes
 * 
 * @param utcDate - Date object in UTC timezone
 * @returns Date object representing the same moment in IST
 */
export function convertUTCToIST(utcDate: Date): Date {
  // IST is UTC+5:30, so add 5.5 hours to get IST
  const istTime = utcDate.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istTime);
}

/**
 * Formats a UTC date as IST string for display
 * 
 * @param utcDate - Date object in UTC timezone
 * @returns Formatted string showing IST time
 */
export function formatUTCAsIST(utcDate: Date): string {
  return utcDate.toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}