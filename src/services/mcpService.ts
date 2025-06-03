import { ConversationState, SearchCriteria, UnifiedProperty } from '@/types/property';

export class MCPService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  async searchProperties(criteria: SearchCriteria): Promise<UnifiedProperty[]> {
    console.log('🔍 Starting MCP-powered property search with criteria:', criteria);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/properties/mcp-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ criteria })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'MCP property search failed');
      }

      const data = await response.json();
      console.log(`✅ MCP search returned ${data.properties.length} properties`);
      
      return data.properties;
      
    } catch (error) {
      console.error('❌ MCP property search failed:', error);
      throw new Error('Failed to search properties via MCP');
    }
  }
} 