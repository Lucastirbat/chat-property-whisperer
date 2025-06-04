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
      
      const tools = [
        {
          name: 'jupri_zillow_scraper',
          description: "Search Zillow for rental housing. This tool PRIMARILY uses a 'prompt' string. Construct a detailed natural language prompt encompassing all known user criteria (location, price, bedrooms, property type, keywords like 'pet-friendly', 'parking'). It also requires 'search_type': 'rent'. Optionally, it can take 'limit' (e.g., 15-20) to control the number of results.",
          input_schema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: "A natural language search query for Zillow. e.g., '2 bedroom apartments for rent in San Francisco under $3500 with parking and pet friendly'. Include all available details."
              },
              search_type: { 
                type: 'string',
                enum: ['rent'],
                description: "Must be 'rent' for rental searches."
              },
              limit: {
                type: 'integer',
                description: 'Optional. Maximum number of properties to fetch (e.g., 15 or 20).'
              }
            },
            required: ['prompt', 'search_type']
          }
        },
        {
          name: 'epctex_apartments_scraper',
          description: "Searches Apartments.com for rental properties. It can take a `search` keyword for a location (e.g., 'New York'), `startUrls` for specific Apartments.com URLs, `maxItems` to limit results, and `endPage` to limit pagination. It requires a `proxy` configuration: { \"useApifyProxy\": true }.",
          input_schema: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
                description: "Location keyword to search for, e.g., 'New York' or 'San Francisco, CA'."
              },
              startUrls: {
                type: 'array',
                description: "Optional. List of specific Apartments.com URLs to scrape.",
                items: { type: 'string', format: 'url' }
              },
              maxItems: {
                type: 'integer',
                description: "Optional. Maximum number of properties to scrape."
              },
              endPage: {
                type: 'integer',
                description: "Optional. Final number of search result pages to scrape."
              },
              proxy: {
                type: 'object',
                description: "Required. Proxy configuration.",
                properties: {
                  useApifyProxy: {
                    type: 'boolean',
                    description: "Must be true to use Apify Proxy."
                  }
                },
                required: ['useApifyProxy']
              },
              includeAllImages: { type: 'boolean', description: "Optional. Set to true to download all images.", default: false },
              includeVirtualTours: { type: 'boolean', description: "Optional. Set to true to include virtual tour links.", default: false }
            },
            required: ['proxy'] // `search` or `startUrls` would typically be required too, user needs to provide one.
          }
        },
        {
          name: 'epctex_realtor_scraper',
          description: "Searches Realtor.com for properties. It can take a `search` keyword (e.g., city or zip code) along with a `mode` ('RENT', 'BUY', or 'SOLD'). Alternatively, it can take `startUrls` for specific Realtor.com URLs. Other options include `maxItems` and `endPage`. It requires a `proxy` configuration: { \"useApifyProxy\": true }.",
          input_schema: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
                description: "Keyword for search (e.g., city, zip code like 'Las Vegas' or '90210'). Use with 'mode'."
              },
              mode: {
                type: 'string',
                enum: ['RENT', 'BUY', 'SOLD'],
                description: "Mode of search. Required if 'search' is provided. For rentals, use 'RENT'."
              },
              startUrls: {
                type: 'array',
                description: "Optional. List of specific Realtor.com URLs to scrape.",
                items: { type: 'string', format: 'url' }
              },
              maxItems: {
                type: 'integer',
                description: "Optional. Maximum number of items to scrape."
              },
              endPage: {
                type: 'integer',
                description: "Optional. Final number of search result pages to scrape."
              },
              proxy: {
                type: 'object',
                description: "Required. Proxy configuration.",
                properties: {
                  useApifyProxy: {
                    type: 'boolean',
                    description: "Must be true to use Apify Proxy."
                  }
                },
                required: ['useApifyProxy']
              },
              includeFloorplans: { type: 'boolean', description: "Optional. Set to true to include floorplan data.", default: false }
            },
            required: ['proxy'] // `search`+`mode` OR `startUrls` would typically be required.
          }
        },
        {
          name: 'epctex_apartmentlist_scraper',
          description: "Searches ApartmentList.com for rental properties. Requires a `proxy` configuration: { \"useApifyProxy\": true }. You can provide `startUrls` (specific ApartmentList.com URLs, including search result pages or specific property detail pages), `maxItems` to limit the number of results, and `endPage` to limit pagination if scraping a list via `startUrls`. Example: { \"startUrls\": [\"https://www.apartmentlist.com/ca/san-francisco\"], \"maxItems\": 15, \"proxy\": { \"useApifyProxy\": true } }.",
          input_schema: {
            type: 'object',
            properties: {
              startUrls: {
                type: 'array',
                description: "List of ApartmentList.com URLs. Can be search result URLs or specific property detail URLs.",
                items: { type: 'string', format: 'url' }
              },
              maxItems: {
                type: 'integer',
                description: "Optional. Maximum number of properties to scrape. Applies to each URL if multiple are given."
              },
              endPage: {
                type: 'integer',
                description: "Optional. Final number of pages to scrape if a startUrl is a list. Default is infinite."
              },
              proxy: {
                type: 'object',
                description: "Required. Proxy configuration.",
                properties: {
                  useApifyProxy: {
                    type: 'boolean',
                    description: "Must be true to use Apify Proxy."
                  }
                },
                required: ['useApifyProxy']
              }
            },
            required: ['proxy', 'startUrls'] // Requires at least one URL to start.
          }
        }
        // ivanvs-slash-craigslist-scraper removed
        // Other new scrapers will be added here
      ];
      
      const requestBody = {
        model: 'claude-3-5-sonnet-20240620', // Ensure you're using a strong tool-use model
        max_tokens: 4000,
        system: systemPrompt,
        messages: claudeMessages,
        tools: tools
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
    
    let allFetchedProperties: UnifiedProperty[] = [];

    if (claudeResponse.stop_reason === 'tool_use') {
      console.log('🛠️ Claude wants to use MCP tools');
      
      const toolUseContents = claudeResponse.content.filter((content: any) => content.type === 'tool_use');
      
      if (toolUseContents && toolUseContents.length > 0) {
        console.log(`🏠 Claude requesting ${toolUseContents.length} tools.`);
        
        const toolExecutionPromises = toolUseContents.map(async (toolUseContent: any) => {
          console.log(`Executing tool: ${toolUseContent.name} with input:`, toolUseContent.input);
          const searchResult = await this.executeMCPPropertySearch(toolUseContent.name, toolUseContent.input);
          return {
            tool_use_id: toolUseContent.id,
            name: toolUseContent.name, // For logging/debugging results
            ...searchResult // Spread success, properties, count, message, error
          };
        });

        // Wait for all tool executions to settle (either resolve or reject)
        const toolExecutionResults = await Promise.allSettled(toolExecutionPromises);

        const toolResultsForClaude: any[] = [];
        
        toolExecutionResults.forEach(settledResult => {
          if (settledResult.status === 'fulfilled') {
            const result = settledResult.value;
            console.log(`✅ Tool ${result.name} (ID: ${result.tool_use_id}) executed. Success: ${result.success}. Properties found: ${result.properties?.length || 0}`);
            if (result.success && result.properties && result.properties.length > 0) {
              allFetchedProperties = allFetchedProperties.concat(result.properties);
            }
            // Add to results for Claude, whether success or backend-reported failure
            toolResultsForClaude.push({
              type: 'tool_result',
              tool_use_id: result.tool_use_id,
              content: JSON.stringify({ // Keep the structure executeMCPPropertySearch returns
                success: result.success,
                count: result.count,
                message: result.message,
                error: result.error, // Will be undefined if success
                // We don't send the full properties array back to Claude in tool_result, just a summary
                // Claude will summarize based on the properties it *receives* in the final step.
              })
            });
          } else {
            // This case handles errors in the promise execution itself (e.g., network error in executeMCPPropertySearch before backend responds)
            // However, executeMCPPropertySearch is designed to return a structured error, so this might be rare.
            console.error('❌ Tool execution promise rejected:', settledResult.reason);
            // We need a tool_use_id to report back to Claude. This is tricky if the promise itself failed.
            // For now, we might not be able to report this specific failure back in the structured tool_result format
            // if we can't access the original tool_use_id easily here.
            // This part might need refinement if such errors become common.
            // For now, we'll rely on executeMCPPropertySearch to return success:false.
          }
        });
        
        if (toolResultsForClaude.length === 0 && toolUseContents.length > 0) {
           // This case should ideally not be hit if executeMCPPropertySearch always returns a structured response
           console.warn("No tool results could be formulated for Claude, despite tool_use blocks being present.");
           // Potentially create a generic error tool_result for each tool_use_id if possible.
           // For now, let Claude respond without specific tool results if this rare case occurs.
        }


        // Send all tool results back to Claude for a final response
        const followUpRequestBody = {
          model: "claude-3-5-sonnet-20240620",
          messages: [
            ...claudeMessages,
            {
              role: 'assistant',
              content: claudeResponse.content // Send the full original assistant content array
            },
            {
              role: 'user',
              content: toolResultsForClaude // This is now an array of tool_result objects
            }
          ],
          system: this.buildSystemPromptWithMCP(currentState),
          max_tokens: 4096,
          stream: false,
          // No tools needed for this summarization call
        };

        console.log('[AIService] Preparing for follow-up call to Claude. Request body:', JSON.stringify(followUpRequestBody, null, 2));
        let followUpData: any;
        let aiFinalText = "I've finished searching with the available tools."; // Default message

        const followUpController = new AbortController();
        const followUpTimeoutId = setTimeout(() => followUpController.abort(), 60000); // 60 seconds timeout

        try {
          const followUpResponse = await fetch(`${this.baseUrl}/api/ai/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(followUpRequestBody),
            signal: followUpController.signal
          });

          clearTimeout(followUpTimeoutId);

          if (!followUpResponse.ok) {
            const errorText = await followUpResponse.text();
            console.error(`[AIService] Follow-up call to Claude FAILED. Status: ${followUpResponse.status}. Body: ${errorText}`);
            // Use a default response and proceed with any properties found
            aiFinalText = `I found some properties, but encountered an issue when trying to summarize all results (HTTP ${followUpResponse.status}). Here's what I gathered:`;
          } else {
            followUpData = await followUpResponse.json();
            console.log('[AIService] Follow-up call to Claude SUCCEEDED. Response data:', JSON.stringify(followUpData, null, 2));
            if (followUpData.content && Array.isArray(followUpData.content) && followUpData.content.length > 0) {
                const textContent = followUpData.content.find((c: any) => c.type === 'text');
                if (textContent) {
                    aiFinalText = textContent.text;
                } else if (allFetchedProperties.length > 0) {
                    aiFinalText = `I've processed the search results from multiple sources. Found ${allFetchedProperties.length} properties.`;
                } else {
                    aiFinalText = "I've completed the search, but it seems no properties matched all your criteria across the platforms I checked.";
                }
            } else if (allFetchedProperties.length > 0) {
                 aiFinalText = `I have gathered ${allFetchedProperties.length} properties based on your query.`;
            }
          }
        } catch (error: any) {
            clearTimeout(followUpTimeoutId);
            if (error.name === 'AbortError') {
              console.error('[AIService] Follow-up call to Claude TIMED OUT after 60 seconds.');
              aiFinalText = "I've gathered the property data, but summarizing it took too long. Here are the properties I found:";
            } else {
              console.error('[AIService] Follow-up call to Claude THREW AN EXCEPTION:', error);
              aiFinalText = `I found some properties, but encountered an exception when trying to summarize the results: ${error.message}. Here's what I gathered:`;
            }
        }
        
        // ADD THIS LOG:
        console.log('[AIService] Final properties being sent to ChatInterface:', allFetchedProperties);
        console.log(`[AIService] Total properties from all tools: ${allFetchedProperties.length}`);

        const finalState = this.parseConversationForCriteria(claudeMessages, aiFinalText, currentState);

        return {
          response: aiFinalText,
          newState: finalState,
          properties: allFetchedProperties // Return all aggregated properties
        };

      } else {
        console.warn('Claude indicated tool_use, but no tool_use content blocks were found.');
        // Fallback to treating as a regular text response if no tool_use blocks
      }
    }

    // Regular text response from Claude (or if tool_use parsing failed to proceed)
    const responseText = claudeResponse.content?.find((c: any) => c.type === 'text')?.text || 'I apologize, but I had trouble processing that request.';
    const newState = this.parseConversationForCriteria(claudeMessages, responseText, currentState);
    
    return {
      response: responseText,
      newState,
      properties: allFetchedProperties // Could be empty if no tool use or tools failed
    };
  }

  private async executeMCPPropertySearch(toolName: string, toolInput: any) {
    console.log(`🚀 Executing MCP property search via backend for tool: ${toolName}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

    try {
      const response = await fetch(`${this.baseUrl}/api/properties/mcp-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toolName: toolName,    // Send the actual tool name provided by Claude
          toolInput: toolInput   // Send the actual tool input provided by Claude
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId); // Clear the timeout if the fetch completes

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
      
    } catch (error: any) {
      clearTimeout(timeoutId); // Clear the timeout in case of other errors
      if (error.name === 'AbortError') {
        console.error(`❌ MCP property search for tool ${toolName} timed out after 2 minutes.`);
        return {
          success: false,
          error: 'Tool execution timed out.',
          properties: [],
          count: 0,
          message: `Tool ${toolName} took too long to respond and was timed out.`
        };
      }
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
    let prompt = `You are an AI property rental assistant with access to web scraping tools via Apify MCP.
Your goal is to gather property details based on user input and then use the available tools to find matching listings.

Conversation Stages:
- greeting: Initial welcome.
- gathering: Ask questions to get location, budget, bedrooms, etc.
- confirming: Summarize criteria and ask user for confirmation before searching.
- searching: Indicate you are now searching for properties using your tools.
- presenting: Show the results or state if none were found.

Current conversation stage: ${state.stage}
Collected criteria: ${JSON.stringify(state.criteria, null, 2)}
Missing information: ${state.missingInfo.join(', ') || 'None'}
`;

    prompt += `
Your available tools for property searching are:
- jupri_zillow_scraper: For searching Zillow. This tool PRIMARILY uses a 'prompt' string. Construct a detailed natural language prompt encompassing all known user criteria (location, price, bedrooms, property type, keywords like 'pet-friendly', 'parking'). It also requires 'search_type': 'rent'. Optionally, it can take 'limit' (e.g., 15-20) to control the number of results. Example input: { "prompt": "2 bedroom apartments in San Francisco under $3000 with parking", "search_type": "rent", "limit": 15 }.
- epctex_apartments_scraper: Searches Apartments.com. Requires a 'proxy': { "useApifyProxy": true }. Provide EITHER a general 'search' string (e.g., "Austin, TX" or "90210") OR specific 'startUrls' (Apartments.com links). 'maxItems' can limit results. Example for general search: { "search": "Austin, TX", "maxItems": 20, "proxy": { "useApifyProxy": true } }.
- epctex_realtor_scraper: Searches Realtor.com. Requires a 'proxy': { "useApifyProxy": true }. For rentals, use 'mode': 'RENT' along with a general 'search' keyword (city, zip like "Miami, FL"). Alternatively, use 'startUrls' for specific Realtor.com links. 'maxItems' can limit results. Example for general rental search: { "search": "Miami, FL", "mode": "RENT", "maxItems": 20, "proxy": { "useApifyProxy": true } }.
- epctex_apartmentlist_scraper: Searches ApartmentList.com. Requires 'proxy': { "useApifyProxy": true } and 'startUrls'. For a general search, construct a search URL for ApartmentList.com (e.g., for San Francisco, CA, a URL like 'https://www.apartmentlist.com/ca/san-francisco'). You can provide one or more such URLs. Use 'maxItems' to limit results and 'endPage' to control pagination. Example: { "startUrls": ["https://www.apartmentlist.com/ca/san-francisco"], "maxItems": 15, "proxy": { "useApifyProxy": true } }.",
`;

    prompt += `

Tool Usage Guidelines:
- When you have enough information (at least location and an idea of budget or bedroom count), transition to the 'searching' stage.
- Based on the user query and collected criteria, decide which tools are most appropriate. For general location-based searches, you **must** use all of the following tools in parallel to ensure comprehensive results: jupri_zillow_scraper, epctex_apartments_scraper, epctex_realtor_scraper, and epctex_apartmentlist_scraper.
- For Zillow (jupri_zillow_scraper), craft a good 'prompt'.
- For Apartments.com (epctex_apartments_scraper), ensure 'proxy' is set. Provide a 'search' term for general queries or specific 'startUrls'.
- For Realtor.com (epctex_realtor_scraper), ensure 'proxy' is set. Use 'search' and 'mode': 'RENT' for general rental searches, or specific 'startUrls'.
- For ApartmentList.com (epctex_apartmentlist_scraper), ensure 'proxy' is set and provide 'startUrls'. Remember, for general city/area searches, you need to construct the appropriate search URL for ApartmentList.com itself (e.g., 'https://www.apartmentlist.com/STATE_ABBREVIATION/CITY_NAME').
`;

    prompt += `
After tool execution, you will receive a summary of results (or errors). Inform the user of what was found or if there were issues.
If properties are found, they will be displayed separately. Your textual response should summarize the search outcome.
Address the user directly. Be conversational and helpful.
Only ask for missing information if it's critical for the current stage or for a tool call.
If the user provides explicit criteria, use them. Otherwise, you can make reasonable inferences if necessary, but state them.
If a search yields no results, inform the user and perhaps suggest broadening their criteria.
Do not ask for confirmation again if you are already in the 'searching' or 'presenting' stage unless the user provides new information that changes the search.`;

    prompt += `
- For Zillow, craft a good 'prompt'.
- For Apartments.com (epctex_apartments_scraper), ensure 'proxy' is set. Provide 'search' for general queries or 'startUrls' for specific links.
- For Realtor.com (epctex_realtor_scraper), ensure 'proxy' is set. Use 'search' and 'mode': 'RENT' for general rental searches, or 'startUrls' for specific links.
- For ApartmentList.com (epctex_apartmentlist_scraper), ensure 'proxy' is set and provide 'startUrls'.
`;

    return prompt;
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