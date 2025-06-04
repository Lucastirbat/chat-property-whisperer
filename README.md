# Property Whisperer

Property Whisperer is an AI-powered web application designed to help users find rental properties. It features a chat interface where users can specify their requirements, and an AI assistant (powered by Anthropic Claude) interacts with them, gathers details, and then uses backend services to search for properties across various platforms like Zillow, Apartments.com, Realtor.com, and ApartmentList.com via an Apify Master Control Program (MCP).

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
  - [Frontend](#frontend)
  - [Backend](#backend)
- [Architecture](#architecture)
  - [Frontend Architecture](#frontend-architecture)
  - [Backend Architecture](#backend-architecture)
  - [Workflow Overview](#workflow-overview)
- [Setup and Installation](#setup-and-installation)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Project Structure](#project-structure)
  - [Backend Directory (`backend/`)](#backend-directory-backend)
  - [Frontend Directory (`src/`)](#frontend-directory-src)
- [Detailed Documentation](#detailed-documentation)
  - [Backend Detailed Documentation](#backend-detailed-documentation)
  - [Frontend Detailed Documentation](#frontend-detailed-documentation)
- [Contributing](#contributing)
- [License](#license)

## Project Overview

The application consists of a React frontend that provides the user interface and a Node.js/Express backend that acts as a proxy to Anthropic's Claude API and an Apify MCP server for property scraping. The AI assistant guides the user through specifying their rental needs, then triggers searches and presents the findings.

## Features

*   Conversational AI interface for property search.
*   Dynamic criteria gathering (location, budget, size, amenities).
*   Integration with multiple property scraping tools via Apify MCP.
*   Unified display of property listings from various sources.
*   Responsive design for chat and property viewing.

## Tech Stack

### Frontend

*   **React 18** with TypeScript
*   **Vite** (Build tool & Dev Server)
*   **Tailwind CSS** (Styling)
*   **Shadcn UI** (UI Components)
*   **React Router DOM** (Routing)
*   **React Query (`@tanstack/react-query`)** (Server state management)

### Backend

*   **Node.js**
*   **Express.js** (Web Framework)
*   **node-fetch** (For making HTTP requests)
*   **EventSource** (For Server-Sent Events client)
*   **dotenv** (Environment variable management)
*   **cors** (Cross-Origin Resource Sharing)

## Architecture

### Frontend Architecture

The frontend is a single-page application (SPA) built with React.
*   **Entry Point**: `src/main.tsx` initializes the React app.
*   **Root Component (`App.tsx`)**: Sets up global providers (React Query, Toaster, Tooltip) and routing.
*   **Pages (`src/pages/`)**:
    *   `Index.tsx`: Main page, renders the `ChatInterface`.
    *   `NotFound.tsx`: For 404 errors.
*   **Components (`src/components/`)**:
    *   `ChatInterface.tsx`: Core component managing chat state, AI interaction, and display of messages and properties.
    *   `Message.tsx`: Renders individual chat messages.
    *   `PropertyList.tsx` & `PropertyCard.tsx`: Display fetched property listings.
    *   `ui/`: Shadcn UI components.
*   **Services (`src/services/`)**:
    *   `aiService.ts`: Handles all communication with the backend for AI chat and property searches (via Claude and MCP tools).
*   **Types (`src/types/`)**:
    *   `property.ts`: Defines crucial data structures like `UnifiedProperty`, `SearchCriteria`, and `ConversationState`.
*   **State Management**: Primarily uses React component state (`useState`, `useRef`) within `ChatInterface.tsx` and React Query for server state.

### Backend Architecture

The backend is a Node.js/Express server acting as a Backend-for-Frontend (BFF) and proxy.
*   **Server (`backend/server.js`)**:
    *   Sets up an Express server with middleware (CORS, JSON parser).
    *   **Endpoints**:
        *   `GET /health`: Health check.
        *   `POST /api/ai/chat`: Proxies requests to Anthropic Claude API, managing API key and tool configurations.
        *   `POST /api/properties/mcp-search`: Handles property search requests by invoking specific scraper tools via the Apify MCP integration.
    *   **Core Logic**:
        *   `callApifyMCPTool()`: Manages SSE communication with the Apify MCP server task to initiate tool calls and retrieve initial run/dataset IDs.
        *   `fetchPropertiesViaMCP()`: Orchestrates the full MCP tool lifecycle: gets IDs, polls Apify actor runs, fetches dataset items upon completion, and normalizes results.
        *   `normalizeAndStructureDatasetItems()`: Transforms raw data from various scrapers (Zillow, Apartments.com, Realtor.com, ApartmentList) into a `UnifiedProperty` structure.
        *   `deduplicateProperties()`: Removes duplicate property listings.
*   **Environment Variables**: Uses `.env` file for `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, and `PORT`.

### Workflow Overview

1.  User opens the app; `ChatInterface` initializes with a greeting.
2.  User sends a message with their property needs.
3.  `ChatInterface` (via `aiService.ts`) sends the conversation to the backend's `/api/ai/chat` endpoint.
4.  Backend forwards the request to Anthropic Claude, including system prompt and tool definitions.
5.  Claude responds:
    *   If asking for more info, the text is displayed to the user.
    *   If ready to search, Claude requests specific tools (e.g., Zillow scraper) with parameters.
6.  If tools are requested, `aiService.ts` calls the backend's `/api/properties/mcp-search` endpoint for each tool.
7.  The backend's `fetchPropertiesViaMCP` function:
    *   Calls `callApifyMCPTool` to interact with your custom Apify MCP server task, which starts the actual scraper actor(s) on Apify.
    *   Polls the Apify actor run(s) for completion.
    *   Fetches the results (dataset items) from Apify.
    *   Normalizes and deduplicates the property data.
    *   Returns the structured `UnifiedProperty[]` array to `aiService.ts`.
8.  `aiService.ts` sends the tool execution results (summary, not full data) back to Claude (via `/api/ai/chat`) for a final summarization.
9.  Claude provides a textual summary of the search.
10. `aiService.ts` returns this summary and the `UnifiedProperty[]` to `ChatInterface`.
11. `ChatInterface` displays Claude's summary and the fetched properties in the UI.

## Setup and Installation

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (or yarn/pnpm)
*   An Anthropic API Key
*   An Apify Account and API Token
*   A deployed Apify MCP (Master Control Program) server task. The URL for this is hardcoded in `backend/server.js` as `https://lucastirbat--property-search-mcp-server.apify.actor`. You'll need to replace this if you use your own.

### Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Backend .env file
PORT=3001
ANTHROPIC_API_KEY=your_anthropic_api_key
APIFY_TOKEN=your_apify_api_token
```

Create a `.env` file in the root project directory (for the frontend) with the following:

```env
# Frontend .env file (root directory)
VITE_BACKEND_URL=http://localhost:3001
```

Replace placeholders with your actual keys and tokens.

### Backend Setup

```bash
cd backend
npm install
npm run dev # For development with nodemon
# or
npm start # For production
```

The backend server will start, typically on `http://localhost:3001`.

### Frontend Setup

```bash
# From the project root directory
npm install
npm run dev
```

The frontend development server will start, typically on `http://localhost:5173`.

## Project Structure

### Backend Directory (`backend/`)

*   **`server.js`**: The core Express.js server application. Handles API requests, proxies to external services (Anthropic, Apify), and manages property data fetching and normalization logic.
*   **`package.json`**: Defines backend dependencies and scripts.

### Frontend Directory (`src/`)

*   **`main.tsx`**: Entry point, renders `App.tsx`.
*   **`App.tsx`**: Root component, sets up routing and global providers.
*   **`components/`**: Reusable React components.
    *   `ChatInterface.tsx`: The main UI for chat and property display.
    *   `ui/`: Shadcn UI library components.
*   **`hooks/`**: Custom React hooks.
*   **`lib/`**: Utility functions.
*   **`pages/`**: Page-level components.
*   **`services/`**: Modules for API interactions.
    *   `aiService.ts`: Manages communication with the backend for AI responses and property searches.
*   **`types/`**: TypeScript definitions.
    *   `property.ts`: Contains definitions for `UnifiedProperty`, `SearchCriteria`, `ConversationState`.

## Detailed Documentation

### Backend Detailed Documentation (`backend/server.js`)

The backend is a Node.js application using Express.js, designed to serve as a Backend-for-Frontend (BFF) and a proxy for the Property Whisperer application.

**Core Functionality**:

1.  **Express Server Setup**: Initializes Express, configures CORS, JSON parsing, and loads environment variables.
2.  **Health Check (`GET /health`)**: Confirms server status.
3.  **Anthropic AI Proxy (`POST /api/ai/chat`)**:
    *   Proxies chat requests to the Anthropic Claude API.
    *   Manages the `ANTHROPIC_API_KEY` securely.
    *   Validates request body and messages.
    *   Constructs the request for Claude, including `tool_choice` if tools are present.
4.  **Apify MCP Tool Call Helper (`callApifyMCPTool`)**:
    *   Manages Server-Sent Events (SSE) communication with a dedicated Apify MCP server task (`https://lucastirbat--property-search-mcp-server.apify.actor`).
    *   Sends tool name and input to the MCP server via a POST request after establishing SSE and receiving an endpoint.
    *   Listens for SSE messages to get `runId` and `datasetId` from the MCP task.
    *   Handles timeouts (10 minutes) and errors during SSE communication.
5.  **Dataset Item Normalization (`normalizeAndStructureDatasetItems`)**:
    *   Transforms raw data from various Apify scrapers (Zillow, Apartments.com, Realtor.com, ApartmentList) into a consistent `UnifiedProperty` structure.
    *   Contains specific mapping logic for each scraper's output format.
    *   Handles variations in field names and data structures (e.g., prices, addresses, bed/bath counts, images, amenities).
    *   The `apartmentlist-scraper` section is notable as it processes `units` within each item to create multiple properties.
    *   Filters properties based on rental status (e.g., for Zillow, Realtor.com).
    *   Skips properties with missing essential data (price, title).
6.  **Property Deduplication (`deduplicateProperties`)**:
    *   Removes duplicate property listings based on a composite key (address/title, price, location/city).
7.  **Property Fetching via MCP (`fetchPropertiesViaMCP`)**:
    *   Orchestrates actor invocation via the MCP server.
    *   Maps Claude-friendly tool names (e.g., `jupri_zillow_scraper`) to MCP-compatible names (e.g., `jupri-slash-zillow-scraper`).
    *   Calls `callApifyMCPTool` to get `runId`/`datasetId`.
    *   If `runId` is obtained, polls the Apify API for actor run completion status (max 9 minutes).
    *   Once a `datasetId` is confirmed, fetches items from the Apify dataset.
    *   Normalizes fetched items using `normalizeAndStructureDatasetItems`.
8.  **MCP Property Search Endpoint (`POST /api/properties/mcp-search`)**:
    *   Main backend endpoint for frontend property searches.
    *   Expects `toolName` and `toolInput` (determined by Claude).
    *   Uses `fetchPropertiesViaMCP` to get property data and returns it.
9.  **Server Initialization**: Starts the server, logs status and configuration details.

**Environment Variables (backend/.env)**:
*   `PORT`: Server port (default: 3001).
*   `ANTHROPIC_API_KEY`: **Required** for Anthropic API.
*   `APIFY_TOKEN`: **Required** for Apify API (fetching run details, dataset items).

### Frontend Detailed Documentation (`src/`)

The frontend is a React SPA providing the user interface.

**Core Components & Logic**:

1.  **`ChatInterface.tsx`**:
    *   **State**: Manages messages, input value, loading states (`isTyping`, `isSearching`), displayed properties, and `conversationState`.
    *   **AI Interaction**:
        *   Uses `AIService` for backend communication.
        *   `handleSendMessage()`: Sends user message, calls `aiService.generateResponse()`, updates state with AI response and properties.
    *   **UI**: Renders chat messages (`Message` component), input field, and the `PropertyList`.
2.  **`AIService.ts`**:
    *   **`generateResponse()`**:
        *   Builds a detailed system prompt (`buildSystemPromptWithMCP`) for Claude, including tool usage guidelines and current conversation state.
        *   Defines `tools` (JSON schema for each scraper) that Claude can request.
        *   Calls the backend `/api/ai/chat`.
        *   Uses `parseClaudeResponse()` to handle Claude's output.
    *   **`parseClaudeResponse()`**:
        *   If Claude requests `tool_use`:
            *   Calls `executeMCPPropertySearch()` for each tool.
            *   Aggregates properties from all successful tool runs.
            *   Sends tool results (summaries) back to Claude for a final textual response.
        *   Returns Claude's text, updated `ConversationState`, and `UnifiedProperty[]`.
    *   **`executeMCPPropertySearch()`**:
        *   Calls backend `/api/properties/mcp-search` with `toolName` and `toolInput`.
        *   Returns a structured result (success status, properties, count, message) for Claude's tool result processing.
        *   Includes a 2-minute timeout.
    *   **`buildSystemPromptWithMCP()`**: Creates a dynamic, detailed system prompt instructing Claude on conversation flow and how to use each of the four MCP tools (Zillow, Apartments.com, Realtor.com, ApartmentList), emphasizing parallel execution for comprehensive searches.
    *   **Criteria Extraction**: Helper methods (`extractLocation`, `extractBudget`, etc.) to parse text and update `SearchCriteria`.
3.  **`PropertyList.tsx` & `PropertyCard.tsx`**: Responsible for displaying property data.
4.  **Type Definitions (`types/property.ts`)**:
    *   `UnifiedProperty`: Standardized structure for property data.
    *   `SearchCriteria`: User's search preferences.
    *   `ConversationState`: Tracks conversation stage, criteria, and missing info.

**Environment Variables (root .env)**:
*   `VITE_BACKEND_URL`: URL for the backend server (default: `http://localhost:3001`).

## Contributing

Please refer to the project's issue tracker for areas needing contribution. Fork the repository, create a feature branch, and submit a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

