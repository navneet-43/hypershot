# Social Media Publishing Automation Tool

## Project Overview

This project aims to create an advanced social media publishing automation tool that streamlines content management across multiple Facebook business accounts with intelligent scheduling and integration capabilities. It serves as a comprehensive solution for social media managers who need to handle multiple accounts, schedule posts in advance, and maintain a consistent publishing workflow.

## Core Objectives

1. **Simplified Social Media Management**: Provide a central dashboard for managing multiple Facebook business accounts without constantly switching between them.
2. **Automated Content Publishing**: Enable scheduling of posts across different accounts with specific publish dates and times.
3. **Content Organization**: Implement a labeling system and search functionality to organize and find posts easily.
4. **Third-Party Integration**: Allow importing content from Asana tasks and Excel files to minimize manual data entry.
5. **Content Calendar**: Provide visual calendar interfaces for planning and reviewing upcoming content.
6. **Multilingual Support**: Enable creating posts in different languages for international audience targeting.
7. **Media Management**: Support uploading and attaching media files (images, videos) to posts.
8. **Activity Tracking**: Log all publishing activities for audit and analytics purposes.

## Technical Architecture

### 1. Data Collection Layer
- **Facebook OAuth Integration**: Authenticates users and retrieves their Facebook pages automatically
- **Asana Integration**: Imports tasks from Asana projects into the publishing system
- **Excel Import**: Parses Excel files with scheduled content for bulk import
- **Media Upload**: Handles image and video uploads to Cloudinary

### 2. Data Processing Layer
- **Scheduling Logic**: Determines optimal posting times and manages the queue
- **Data Transformation**: Converts imported data into the system's format
- **Validation**: Ensures all required fields are present and formatted correctly

### 3. Publishing Layer
- **Facebook Graph API Integration**: Publishes posts to Facebook pages
- **Error Handling**: Manages publishing failures with retry mechanisms
- **Scheduled Tasks**: Background processes that publish content at specified times

### 4. User Interface Layer
- **Dashboard**: Overview of scheduled posts, recent activities, and key metrics
- **Calendar View**: Visual representation of the publishing schedule
- **Account Management**: Interface for connecting and managing Facebook accounts
- **Post Editor**: Rich editor for creating and editing posts with media attachments
- **Settings**: Configuration options for labels, integrations, and user preferences

## Database Schema

The database is structured around these core entities:

1. **Users**
   - Basic user information, authentication details, and Facebook connection data

2. **Facebook Accounts**
   - Connected Facebook pages with access tokens and associated metadata
   - Relationship: Belongs to a User

3. **Asana Integrations**
   - Asana workspace and project connections
   - Relationship: Belongs to a User

4. **Custom Labels**
   - User-defined categorization system for posts
   - Relationship: Belongs to a User

5. **Posts**
   - The core content entity with scheduling information, content, and metadata
   - Relationships: Belongs to a User, belongs to a Facebook Account
   - Properties: Content, scheduling timestamp, status, media attachments

6. **Activities**
   - Log of all user actions and system events
   - Relationship: Belongs to a User

## Implementation Progress

### Completed Features

1. **User Authentication**
   - Basic login/logout functionality
   - Session management
   - User profile management

2. **Facebook Integration**
   - OAuth authentication flow with proper permissions
   - Automatic page synchronization
   - Access token management
   - Page connection status monitoring

3. **Database Storage**
   - Schema design
   - CRUD operations for all entities
   - Relationship modeling

### In-Progress Features

1. **Post Management**
   - Post creation interface
   - Scheduling functionality
   - Media upload integration
   - Post status tracking

2. **Dashboard**
   - Activity feeds
   - Scheduled post overview
   - Account status indicators

3. **Content Calendar**
   - Month/week/day views
   - Drag-and-drop rescheduling

### Planned Features

1. **Asana Integration**
   - OAuth connection to Asana
   - Task mapping to post fields
   - Automated import on schedule

2. **Analytics**
   - Post performance metrics
   - Best time to post analysis
   - Account growth tracking

3. **Team Collaboration**
   - Multiple user accounts
   - Role-based permissions
   - Approval workflows

## Technical Implementation Details

### Frontend

- **Framework**: React with TypeScript
- **State Management**: React Query for server state
- **UI Components**: Shadcn UI (built on Radix UI)
- **Styling**: Tailwind CSS with custom theming
- **Routing**: Wouter for lightweight client-side routing

### Backend

- **Framework**: Express.js with TypeScript
- **Database Access**: Drizzle ORM
- **Authentication**: Passport.js with Facebook strategy
- **Media Storage**: Cloudinary integration
- **Background Jobs**: Node-schedule for task scheduling

### Database

- **Type**: PostgreSQL (through Neon Serverless Postgres)
- **Schema**: Strongly typed schema using Drizzle ORM
- **Data Validation**: Zod schemas derived from database models

## External Integrations

### 1. Facebook Graph API

The system integrates with Facebook Graph API to:
- Fetch user pages and access tokens
- Post content to Facebook pages
- Upload media files
- Monitor post status
- Retrieve engagement metrics

Required permissions:
- `email`: Basic profile access
- `pages_show_list`: View the list of pages the user manages
- `pages_manage_posts`: Create and manage posts on behalf of pages
- `pages_read_engagement`: Read engagement metrics

### 2. Asana API

The planned Asana integration will:
- Connect to user's Asana workspace
- Browse and select projects
- Map task fields to post attributes
- Import tasks as scheduled posts

### 3. Cloudinary API

The media management system uses Cloudinary to:
- Upload and store images (all formats)
- Upload and process videos (up to 100MB)
- Generate optimized versions for different platforms
- Provide CDN-served URLs for media

## Security Considerations

1. **Authentication**
   - Session-based authentication with secure cookies
   - OAuth token secure storage
   - CSRF protection

2. **Data Protection**
   - Access token encryption
   - User data isolation
   - Input validation

3. **API Security**
   - Rate limiting
   - Request validation
   - Error obfuscation

## Deployment Strategy

The application is deployed on Replit with the following configuration:

1. **Build Process**
   - Frontend built with Vite
   - Backend bundled with ESBuild
   - Combined output in `/dist` directory

2. **Runtime Configuration**
   - Environment variables for credentials and configuration
   - Production/development mode separation
   - Database connection pooling

3. **Scaling Considerations**
   - Connection pool management
   - Background job distribution
   - Media proxy caching

## User Workflow Examples

### Example 1: Connecting Facebook Accounts

1. User logs in to the application
2. User navigates to the Facebook Accounts page
3. User clicks "Login with Facebook" button
4. User grants necessary permissions on Facebook
5. System retrieves user's Facebook pages automatically
6. System adds pages to the user's account
7. User can now schedule posts to these pages

### Example 2: Scheduling a Post

1. User navigates to the Publishing Calendar
2. User selects a date/time slot
3. User enters post content, selects target accounts
4. User uploads media (optional)
5. User adds labels and language specification
6. User saves the post as scheduled
7. At the scheduled time, system publishes to Facebook
8. System logs the activity and updates post status

### Example 3: Importing from Asana

1. User connects Asana account in settings
2. User selects workspace and project to import from
3. User maps Asana fields to post attributes
4. User starts import process
5. System converts Asana tasks to scheduled posts
6. User reviews and approves imported posts
7. Posts are scheduled for publishing

## Setup and Configuration Guide

To set up the application:

1. **Environment Variables**
   - Database connection string
   - Facebook App ID and Secret
   - Cloudinary credentials
   - Session secret

2. **Facebook App Configuration**
   - Create app on Facebook Developers
   - Configure OAuth redirect URLs
   - Add required permissions
   - Set up proper app domains

3. **Database Initialization**
   - Run schema migrations
   - Create initial admin user
   - Set up necessary indexes

4. **Local Development**
   - Clone repository
   - Install dependencies
   - Set environment variables
   - Run database migrations
   - Start development server

## Roadmap and Future Enhancements

### Phase 1: Core Functionality (Current)
- Facebook authentication and page management
- Basic post scheduling
- Media uploads
- Simple dashboard

### Phase 2: Integration Expansion
- Asana integration
- Excel import/export
- Analytics dashboard
- Enhanced calendar UI

### Phase 3: Advanced Features
- AI-assisted content suggestions
- Automated best time to post
- Content recycling
- Team collaboration features

### Phase 4: Platform Expansion
- Instagram integration
- Twitter integration
- LinkedIn integration
- Cross-platform publishing