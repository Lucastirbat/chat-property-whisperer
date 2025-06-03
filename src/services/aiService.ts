import { ConversationState, SearchCriteria, UnifiedProperty } from '@/types/property';

// AI Service for Claude 4.0 integration
export class AIService {
  private baseUrl: string;

  constructor(apiKey: string) {
    // We don't need the API key on frontend anymore
    this.baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  async generateResponse(
    messages: any[], 
    conversationState: ConversationState
  ): Promise<{ response: string; newState: ConversationState, properties?: UnifiedProperty[] }> {
    
    try {
      console.log('🤖 Sending request to Claude with MCP support for specific actors...');
      
      const systemPrompt = this.buildSystemPromptWithMCP(conversationState);
      
      const claudeMessages = this.formatMessagesForClaude(messages);
      
      const requestBody = {
        model: 'claude-3-5-sonnet-20240620', // Ensure you're using a strong tool-use model
        max_tokens: 4000,
        system: systemPrompt,
        messages: claudeMessages,
        tools: [
          {
            name: 'epctex-slash-redfin-scraper', 
            description: 'Search for rental properties on Redfin. Use for Redfin-specific searches. Parameters: location (string), maxPrice (number), bedrooms (number), propertyType (string enum), query (string). Required: location.',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'City, State, or ZIP Code for Redfin (e.g., "San Francisco, CA")' },
                maxPrice: { type: 'number', description: 'Max rent price for Redfin (e.g., 3000)' },
                bedrooms: { type: 'number', description: 'Number of bedrooms for Redfin (e.g., 2)' },
                propertyType: { type: 'string', enum: ['apartment', 'house', 'condo', 'townhouse', 'any'], description: 'Property type for Redfin (e.g., "apartment")' },
                query: { type: 'string', description: 'General query for Redfin (e.g., "apartments in Austin TX under $2000")' },
              },
              required: ['location'] 
            }
          },
          {
            name: 'jupri-slash-zillow-scraper', // Zillow tool
            description: 'Search Zillow for rentals. Use a detailed "prompt" string for all search criteria (location, price, bedrooms, etc.). Also requires "search_type" to be "rent". "limit" is optional.',
            input_schema: { // Simplified to match the "prompt-first" strategy strictly
              type: 'object',
              properties: {
                prompt: { 
                  type: 'string', 
                  description: 'REQUIRED: A natural language search query for Zillow (e.g., "2 bedroom apartments for rent in San Francisco under $3500 with a pool") OR a full Zillow search URL.' 
                },
                search_type: { 
                  type: 'string', 
                  enum: ['rent'], // Only allow "rent"
                  description: 'REQUIRED: Must be "rent" for rental properties.' 
                },
                limit: { 
                  type: 'integer', 
                  description: 'Optional: Number of results (1-1000). Suggest 10-20. Defaults to actor\'s own default if not provided.' 
                }
              },
              required: ['prompt', 'search_type'] 
            }
          },
          {
            name: 'ivanvs-slash-craigslist-scraper', 
            description: 'Search Craigslist for rentals. Parameters: location (string), query (string), maxPrice (number), bedrooms (number). Required: location, query.',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'Craigslist city/subdomain (e.g., "sfbay")' },
                maxPrice: { type: 'number', description: 'Max rent price (e.g., 2000)' },
                bedrooms: { type: 'number', description: 'Number of bedrooms (e.g., 1)' },
                query: { type: 'string', description: 'Search query (e.g., "2 bedroom downtown no fee")' },
              },
              required: ['location', 'query'] 
            }
          }
        ]
      };
      
      const response = await fetch(`${this.baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API Error:', response.status, errorText);
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Claude response received');

      // Parse Claude's response and handle tool calls
      return this.parseClaudeResponse(data, conversationState, claudeMessages, requestBody.tools);
      
    } catch (error) {
      console.error('❌ AI Service Error:', error);
      throw error;
    }
  }

  private formatMessagesForClaude(messages: any[]): any[] {
    return messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    })).filter(msg => msg.role === 'user' || msg.role === 'assistant'); // Remove any invalid roles
  }

  private async parseClaudeResponse(
    claudeResponse: any, 
    currentState: ConversationState,
    claudeMessages: any[],
    tools: any[] // Pass tools for follow-up
  ): Promise<{ response: string; newState: ConversationState, properties?: UnifiedProperty[] }> {
    
    let fetchedProperties: UnifiedProperty[] | undefined = undefined;

    // Check if Claude wants to use tools
    if (claudeResponse.stop_reason === 'tool_use') {
      console.log('🛠️ Claude wants to use MCP tools');
      
      // Find the tool use request
      const toolUseContent = claudeResponse.content.find((content: any) => content.type === 'tool_use');
      
      if (toolUseContent) { // Check if toolUseContent is found
        console.log(`🏠 Claude requesting tool: ${toolUseContent.name} with input:`, toolUseContent.input);
        
        // Execute the property search via our backend's MCP integration
        // We pass the exact tool name and input Claude provided
        const searchResult = await this.executeMCPPropertySearch(toolUseContent.name, toolUseContent.input);
        
        if (searchResult.success && searchResult.properties) {
          fetchedProperties = searchResult.properties; // Store fetched properties
        }
        
        // Send the tool result back to Claude for final response
        const followUpRequestBody = {
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4000,
          messages: [
            ...claudeMessages,
            {
              role: 'assistant',
              content: claudeResponse.content // Send the full content array as per Anthropic docs
            },
            {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUseContent.id, // Use the id from the tool_use content block
                content: JSON.stringify(searchResult) // Ensure results are stringified
              }]
            }
          ],
          tools: tools // Include tools in the follow-up
        };

        const followUpResponse = await fetch(`${this.baseUrl}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(followUpRequestBody)
        });

        if (!followUpResponse.ok) {
          const errorText = await followUpResponse.text();
          console.error('Follow-up AI API Error:', followUpResponse.status, errorText);
          throw new Error(`Follow-up AI API error: ${followUpResponse.status}`);
        }

        const followUpData = await followUpResponse.json();
        
        const aiFinalText = followUpData.content?.[0]?.text || "I've processed the search results.";
        
        return {
          response: aiFinalText,
          newState: {
            ...currentState,
            stage: 'presenting',
            criteria: { ...currentState.criteria, isComplete: fetchedProperties ? fetchedProperties.length > 0 : false }
          },
          properties: fetchedProperties // Return the properties
        };
      } else {
        console.warn('Claude indicated tool_use, but no tool_use content block was found or it was not search_properties_via_mcp.');
        // Fallback or handle as an error - for now, let it proceed to regular response
      }
    }

    // Regular text response from Claude
    const responseText = claudeResponse.content?.[0]?.text || 'I apologize, but I had trouble processing that request.';
    const newState = this.parseConversationForCriteria(claudeMessages, responseText, currentState);
    
    return {
      response: responseText,
      newState,
      properties: fetchedProperties // Could be undefined if no tool use
    };
  }

  private async executeMCPPropertySearch(toolName: string, toolInput: any) {
    console.log(`🚀 Executing MCP property search via backend for tool: ${toolName}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/properties/mcp-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toolName: toolName,    // Send the actual tool name provided by Claude
          toolInput: toolInput   // Send the actual tool input provided by Claude
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Property search error:', response.status, errorText);
        // Return a more structured error for the tool_result content block
        return { 
          success: false, 
          error: `Property search failed: ${response.status} - ${errorText}`,
          properties: [],
          count: 0,
          message: `Backend failed to execute tool ${toolName}.`
        };
      }

      const data = await response.json();
      console.log(`✅ Found ${data.properties?.length || 0} properties via MCP tool ${toolName}`);
      
      // Structure the success response for the tool_result content block
      return {
        success: true,
        properties: data.properties || [],
        count: data.properties?.length || 0,
        message: `Found ${data.properties?.length || 0} rental properties using tool ${toolName}.`,
        // Extract sources if available, provide default if not
        sources: Array.isArray(data.properties) ? 
                 data.properties.map((p: any) => p.source).filter((s: any, i: any, arr: any) => arr.indexOf(s) === i) :
                 [toolName] 
      };
      
    } catch (error) {
      console.error(`❌ MCP property search error for tool ${toolName}:`, error);
      // Return a more structured error for the tool_result content block
      return {
        success: false,
        error: error.message,
        properties: [],
        count: 0,
        message: `Failed to search for properties using tool ${toolName}. Please try again.`
      };
    }
  }

  private buildSystemPromptWithMCP(state: ConversationState): string {
    return `You are an AI property rental assistant with access to powerful web scraping tools through the user's dedicated Apify MCP integration.

Your available tools for property searching are:
- epctex-slash-redfin-scraper: For searching Redfin. Uses parameters: location, maxPrice, bedrooms, propertyType, query.
- jupri-slash-zillow-scraper: For searching Zillow. This tool ONLY accepts 'prompt', 'search_type', and optionally 'limit'.
    - For the 'prompt' parameter, you MUST create a single, comprehensive, natural language string that includes ALL user requirements: location, price limits, number of bedrooms, property type, and any other keywords (e.g., "2 bedroom apartments for rent in San Francisco under $3500 with parking").
    - The 'search_type' parameter MUST ALWAYS be "rent".
    - Do NOT attempt to send other parameters like 'location', 'max_price', 'bedrooms', or 'category' directly to this Zillow tool; put all search details into the 'prompt' string.
- ivanvs-slash-craigslist-scraper: For searching Craigslist. Uses parameters: location, query, maxPrice, bedrooms.

Your capabilities:
- Intelligently choose ONE tool per search attempt.
- CRITICAL FOR ZILLOW ('jupri-slash-zillow-scraper'): Construct a detailed 'prompt' string. Set 'search_type' to "rent". Use 'limit' if needed. DO NOT use other parameters.
- Ask clarifying questions to gather all necessary details (location, budget, bedrooms, property type, amenities) BEFORE attempting a search.
- If a search with one tool fails or yields poor results, you can try a different tool or suggest refining the criteria.

Current conversation stage: ${state.stage}
User requirements for next search:
${state.criteria.location ? `- Location: ${state.criteria.location}` : ''}
${state.criteria.maxPrice ? `- Max budget: $${state.criteria.maxPrice}/month` : ''}
${state.criteria.bedrooms !== undefined ? `- Bedrooms: ${state.criteria.bedrooms}` : ''}
${state.criteria.propertyType ? `- Property type: ${state.criteria.propertyType}` : ''}
${state.criteria.amenities?.length ? `- Desired amenities: ${state.criteria.amenities.join(', ')}` : ''}
${state.criteria.petFriendly !== undefined ? `- Pet-friendly: ${state.criteria.petFriendly}` : ''}

Guidelines:
1. Confirm all key details (location, budget, bedrooms) before using a tool.
2. For Zillow: Create a detailed 'prompt' (e.g., "pet-friendly 1 bedroom houses for rent in downtown Austin, TX under $2500 with a balcony") and set 'search_type' to "rent".
3. Present search results clearly, mentioning the source.
4. If a tool call fails, inform the user and you can try an alternative tool if appropriate, or ask the user to rephrase their request.

Example Zillow tool input: { "prompt": "studio apartments for rent in Chicago near Lincoln Park under $1800", "search_type": "rent", "limit": 15 }`;
  }

  private parseConversationForCriteria(messages: any[], aiResponse: string, currentState: ConversationState): ConversationState {
    const fullConversation = messages.map((m: any) => m.content).join(' ') + ' ' + aiResponse;
    const lowerText = fullConversation.toLowerCase();

    const newCriteria = { ...currentState.criteria };

    // Extract location
    if (!newCriteria.location) {
      newCriteria.location = this.extractLocation(lowerText);
    }

    // Extract budget
    if (!newCriteria.maxPrice) {
      newCriteria.maxPrice = this.extractBudget(lowerText);
    }

    // Extract housing details
    const housingDetails = this.extractHousingType(lowerText);
    if (housingDetails.bedrooms !== undefined && newCriteria.bedrooms === undefined) {
      newCriteria.bedrooms = housingDetails.bedrooms;
    }
    if (housingDetails.propertyType && !newCriteria.propertyType) {
      newCriteria.propertyType = housingDetails.propertyType as any;
    }

    // Extract preferences
    const preferences = this.extractPreferences(lowerText);
    if (preferences.petFriendly !== undefined) {
      newCriteria.petFriendly = preferences.petFriendly;
    }
    if (preferences.amenities.length > 0) {
      newCriteria.amenities = [...(newCriteria.amenities || []), ...preferences.amenities];
    }

    // Determine if we have enough info
    const hasBasicInfo = newCriteria.location && (newCriteria.maxPrice || newCriteria.bedrooms !== undefined);
    newCriteria.isComplete = hasBasicInfo;

    // Determine conversation stage
    let newStage = currentState.stage;
    if (newCriteria.isComplete && currentState.stage === 'gathering') {
      newStage = 'confirming';
    } else if (!newCriteria.location) {
      newStage = 'gathering';
    }

    return {
      ...currentState,
      criteria: newCriteria,
      stage: newStage,
      missingInfo: this.identifyMissingInfo(newCriteria)
    };
  }

  private identifyMissingInfo(criteria: SearchCriteria): string[] {
    const missing = [];
    if (!criteria.location) missing.push('location');
    if (!criteria.maxPrice && criteria.bedrooms === undefined) missing.push('budget or room requirements');
    return missing;
  }

  private extractLocation(text: string): string {
    const locationPatterns = [
      /(?:in|near|around|at)\s+([a-zA-Z\s]+?)(?:\s|,|\.|\?|!|$)/gi,
      /([a-zA-Z\s]+?)(?:\s+area|\s+neighborhood|\s+district)/gi,
      /(san francisco|new york|los angeles|chicago|boston|seattle|portland|austin|denver|miami|atlanta)/gi,
      /([a-zA-Z\s]+),?\s*(ca|california|ny|new york|tx|texas|fl|florida|wa|washington)/gi
    ];

    for (const pattern of locationPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.replace(/^(in|near|around|at)\s+/i, '')
                              .replace(/\s+(area|neighborhood|district)$/i, '')
                              .trim();
          if (cleaned.length > 2 && cleaned.length < 50) {
            return cleaned.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
          }
        }
      }
    }
    return '';
  }

  private extractBudget(text: string): number | undefined {
    const budgetPatterns = [
      /\$(\d{1,4}(?:,\d{3})*)/g,
      /(\d{1,4}(?:,\d{3})*)\s*(?:dollars?|bucks?)/gi,
      /budget.*?(\d{1,4}(?:,\d{3})*)/gi,
      /(?:up to|under|below|less than|maximum|max)\s*\$?(\d{1,4}(?:,\d{3})*)/gi
    ];

    for (const pattern of budgetPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const amount = parseInt(match[1].replace(/,/g, ''));
        if (amount >= 500 && amount <= 50000) {
          return amount;
        }
      }
    }
    return undefined;
  }

  private extractHousingType(text: string): { bedrooms?: number; propertyType?: string } {
    const result: { bedrooms?: number; propertyType?: string } = {};

    // Bedroom patterns
    const bedroomPatterns = [
      /(\d+)\s*(?:bed|bedroom|br)/gi,
      /(?:^|\s)(studio|one|two|three|four|five)\s*(?:bed|bedroom)/gi
    ];

    for (const pattern of bedroomPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        let bedrooms: number;
        if (/^\d+$/.test(match[1])) {
          bedrooms = parseInt(match[1]);
        } else {
          const wordMap: { [key: string]: number } = {
            'studio': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5
          };
          bedrooms = wordMap[match[1].toLowerCase()] ?? 0;
        }
        if (bedrooms >= 0 && bedrooms <= 10) {
          result.bedrooms = bedrooms;
          break;
        }
      }
    }

    // Property type patterns
    const typePatterns = [
      { pattern: /apartment|apt/gi, type: 'apartment' },
      { pattern: /house|home/gi, type: 'house' },
      { pattern: /condo|condominium/gi, type: 'condo' },
      { pattern: /studio/gi, type: 'studio' },
      { pattern: /room|shared/gi, type: 'room' }
    ];

    for (const { pattern, type } of typePatterns) {
      if (pattern.test(text)) {
        result.propertyType = type;
        break;
      }
    }

    return result;
  }

  private extractPreferences(text: string): { petFriendly?: boolean; amenities: string[] } {
    const amenities: string[] = [];
    let petFriendly: boolean | undefined;

    // Pet-friendly detection
    if (/pet\s*friendly|pets?\s*allowed|allow\s*pets?/gi.test(text)) {
      petFriendly = true;
    } else if (/no\s*pets?|pet\s*free/gi.test(text)) {
      petFriendly = false;
    }

    // Amenities detection
    const amenityPatterns = [
      { pattern: /parking|garage/gi, amenity: 'parking' },
      { pattern: /laundry|washer|dryer/gi, amenity: 'laundry' },
      { pattern: /pool|swimming/gi, amenity: 'pool' },
      { pattern: /gym|fitness/gi, amenity: 'fitness center' },
      { pattern: /balcony|patio/gi, amenity: 'balcony' },
      { pattern: /air conditioning|ac|a\/c/gi, amenity: 'air conditioning' },
      { pattern: /dishwasher/gi, amenity: 'dishwasher' },
      { pattern: /elevator/gi, amenity: 'elevator' }
    ];

    for (const { pattern, amenity } of amenityPatterns) {
      if (pattern.test(text)) {
        amenities.push(amenity);
      }
    }

    return { petFriendly, amenities };
  }
} 