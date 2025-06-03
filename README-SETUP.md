# Property Whisperer Setup

## Prerequisites
- Node.js (v16 or higher)
- npm or yarn

## Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file with your API keys:
```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
APIFY_TOKEN=your_apify_token_here
PORT=3001
```

4. Start the backend server:
```bash
npm run dev
```

The backend will run on http://localhost:3001

## Frontend Setup

1. Navigate to project root and install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
VITE_BACKEND_URL=http://localhost:3001
```

3. Start the frontend:
```bash
npm run dev
```

The frontend will run on http://localhost:8080

## Getting API Keys

### Anthropic API Key
1. Go to https://console.anthropic.com/
2. Sign up/login
3. Go to API Keys section
4. Create a new API key

### Apify Token
1. Go to https://console.apify.com/
2. Sign up/login
3. Go to Settings > Integrations
4. Copy your API token

## Testing
1. Make sure both backend and frontend are running
2. Open http://localhost:8080 in your browser
3. Start chatting with the AI about property preferences
4. The AI will collect information and trigger real property searches 