# Architecture Overview

## 1. Overview

This application is a Facebook post scheduling and management system with Asana integration capabilities. It allows users to connect their Facebook accounts, schedule posts, and import tasks from Asana to create social media content. The application follows a modern web architecture with a Node.js backend and React frontend.

The application is built as a full-stack TypeScript application with a clear separation between client and server code. It employs a monorepo structure where both frontend and backend code reside in the same repository but in separate directories.

## 2. System Architecture

The system follows a client-server architecture with the following key components:

### 2.1 Frontend Architecture

- **Framework**: React with TypeScript
- **UI Components**: Uses the shadcn/ui component library (based on Radix UI)
- **Styling**: Tailwind CSS for styling with a consistent design system
- **State Management**: React Query for server state and local React state for UI state
- **Routing**: Uses Wouter for lightweight client-side routing

The frontend is organized using a feature-based architecture:
- `/client/src/components`: Reusable UI components
- `/client/src/pages`: Page components that represent different routes
- `/client/src/hooks`: Custom React hooks
- `/client/src/lib`: Utility functions and shared logic
- `/client/src/services`: Service modules for API integrations

### 2.2 Backend Architecture

- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API endpoints
- **Database Access**: Uses Drizzle ORM for database operations
- **Authentication**: Simple session-based authentication (appears to be in development)
- **File Storage**: Uses Cloudinary for image upload and storage

The backend is organized by functionality:
- `/server/index.ts`: Main application entry point
- `/server/routes.ts`: API route definitions
- `/server/db.ts`: Database connection and configuration
- `/server/storage.ts`: Data access layer
- `/server/utils`: Utility functions and services

### 2.3 Database Architecture

- **Database**: PostgreSQL (through Neon Serverless Postgres)
- **ORM**: Drizzle ORM with schema definitions in TypeScript
- **Schema**: Defined in `/shared/schema.ts`

Main entities:
- `users`: User accounts
- `facebookAccounts`: Connected Facebook accounts
- `asanaIntegrations`: Asana workspace connections
- `posts`: Scheduled or published Facebook posts
- `customLabels`: User-defined labels for posts
- `activities`: User activity logs

## 3. Key Components

### 3.1 Frontend Components

1. **UI Component System**
   - Uses shadcn/ui, a collection of reusable components built on top of Radix UI
   - Custom theme system with light/dark mode support
   - Responsive design for mobile and desktop

2. **Page Components**
   - Dashboard: Overview of scheduled posts and recent activity
   - Publishing Calendar: Calendar view for scheduling posts
   - Facebook Accounts: Management of connected Facebook accounts
   - Asana Integration: Configuration for Asana connection
   - Custom Labels: Management of post labeling system

3. **Integration Services**
   - Facebook Graph API integration for posting to pages
   - Asana API integration for importing tasks

### 3.2 Backend Components

1. **API Layer**
   - RESTful endpoints for CRUD operations
   - Authentication middleware
   - Request validation using Zod schemas

2. **Storage Layer**
   - Database interactions abstracted through a storage interface
   - CRUD operations for all entities
   - Transaction support for complex operations

3. **External Services**
   - Cloudinary integration for image uploads
   - Background job scheduling using node-schedule

### 3.3 Shared Components

1. **Schema Definitions**
   - Database schema using Drizzle ORM
   - Zod validation schemas derived from database schemas
   - Type definitions shared between frontend and backend

2. **Type System**
   - TypeScript interfaces for all entities
   - Shared types between frontend and backend in `/shared` directory

## 4. Data Flow

### 4.1 Post Creation and Publishing

1. User creates a post through the UI
2. Frontend validates the data and sends it to the backend API
3. Backend validates the request and stores it in the database
4. If the post is scheduled, a background job is created
5. When the scheduled time arrives, the post is published to Facebook via the Graph API
6. The post status is updated in the database
7. Activity log is created to track the action

### 4.2 Asana Integration Flow

1. User connects their Asana account through OAuth
2. User selects a workspace and project to integrate
3. Tasks from Asana are fetched and displayed in the application
4. User can convert Asana tasks to Facebook posts
5. The relationship between tasks and posts is maintained

### 4.3 Media Upload Flow

1. User uploads an image through the UI
2. Frontend uploads the image to the backend
3. Backend uses Cloudinary to store the image
4. The image URL is returned and associated with the post

## 5. External Dependencies

### 5.1 Frontend Dependencies

- **UI Framework**: React
- **Component Libraries**: Radix UI components (@radix-ui/*)
- **Styling**: Tailwind CSS
- **Form Management**: react-hook-form, zod for validation
- **Data Fetching**: @tanstack/react-query
- **Date Handling**: date-fns

### 5.2 Backend Dependencies

- **Web Framework**: Express.js
- **Database**: @neondatabase/serverless (PostgreSQL)
- **ORM**: drizzle-orm
- **Media Storage**: cloudinary
- **Job Scheduling**: node-schedule
- **File Upload**: multer
- **Validation**: zod
- **WebSockets**: ws (for Neon Postgres connections)

### 5.3 Development Dependencies

- **Build Tools**: Vite, ESBuild
- **TypeScript**: For type safety across the codebase
- **Tailwind**: For styling
- **Replit**: Development environment configuration

## 6. Deployment Strategy

The application is configured for deployment on Replit, as evident from the `.replit` configuration file. The deployment strategy includes:

### 6.1 Build Process

- Frontend is built using Vite
- Backend is bundled using ESBuild
- Combined output is placed in the `/dist` directory

```bash
# Build command from package.json
"build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
```

### 6.2 Environment Configuration

- Development and production environments are distinguished by `NODE_ENV`
- Database connection is configured via environment variables
- External service credentials (like Cloudinary) are passed via environment variables

### 6.3 Deployment Pipeline

- The application is configured for autoscaling deployment on Replit
- Build and run commands are specified in the `.replit` configuration
- Port mapping is configured to expose the application on port 80

```
[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["npm", "run", "start"]
```

### 6.4 Database Management

- Database schema updates are managed through Drizzle Kit
- The `db:push` command is used to update the database schema
- Connection to Neon Serverless Postgres supports WebSocket connections for enhanced performance

## 7. Security Considerations

### 7.1 Authentication

- Simple session-based authentication system
- Facebook access tokens are stored in the database
- Asana OAuth tokens are stored for API access

### 7.2 Data Protection

- Sensitive credentials like access tokens are stored in the database
- External media is stored in Cloudinary with secure URLs
- API routes appear to have authentication checks

### 7.3 Input Validation

- All user inputs are validated using Zod schemas
- Database queries use parameterized queries via Drizzle ORM to prevent SQL injection