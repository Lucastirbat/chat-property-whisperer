const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();
const EventSource = require('eventsource');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Property Whisperer Backend with Claude MCP is running' });
});

// Anthropic AI proxy endpoint with MCP support
app.post('/api/ai/chat', async (req, res) => {
  try {
    console.log('🤖 AI Chat request received with MCP support');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const validMessages = req.body.messages.filter(msg => 
      msg.role && (msg.role === 'user' || msg.role === 'assistant') && msg.content
    );

    if (validMessages.length === 0) {
      return res.status(400).json({ error: 'No valid messages found' });
    }

    const requestBody = {
      ...req.body,
      messages: validMessages
    };
    
    if (req.body.tools && req.body.tools.length > 0) {
      requestBody.tool_choice = { type: "auto" };
    }

    console.log('📤 Sending to Claude:', JSON.stringify({
      model: requestBody.model,
      messages: requestBody.messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 100) + '...' : '[complex content]' })),
      hasTools: !!requestBody.tools,
      toolChoice: requestBody.tool_choice
    }, null, 2));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'AI service error', 
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('✅ Claude response received successfully');
    res.json(data);
    
  } catch (error) {
    console.error('❌ AI service error:', error);
    res.status(500).json({ 
      error: 'AI service unavailable', 
      message: error.message 
    });
  }
});

// Helper function to manage a single tool call via Apify MCP Server using SSE
async function callApifyMCPTool(toolName, toolInput, apiToken) {
  // UPDATED: Use your specific MCP Server Task URL (base path)
  const MCP_SERVER_URL = 'https://lucastirbat--property-search-mcp-server.apify.actor'; 
  const jsonRpcId = `chatprop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  console.log(`📞 Calling MCP tool: ${toolName} via YOUR dedicated MCP Server Task (${MCP_SERVER_URL}) with ID: ${jsonRpcId}`);
  // console.log(`Tool Input: ${JSON.stringify(toolInput, null, 2)}`); // Can be verbose

  if (!apiToken) {
    console.error('❌ API token is missing for MCP call.');
    return reject(new Error('Apify API token is required for MCP communication.'));
  }

  return new Promise((resolve, reject) => {
    // Construct SSE and Message URLs with the provided apiToken
    const sseUrl = `${MCP_SERVER_URL}/sse?token=${apiToken}`;
    let eventSource;
    let timeoutId;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (eventSource) {
        eventSource.close();
        console.log(`🔌 SSE connection closed for ${jsonRpcId}`);
      }
    };

    timeoutId = setTimeout(() => {
      console.error(`⏱️ Timeout for MCP tool call ${jsonRpcId} (${toolName})`);
      cleanup();
      reject(new Error(`Timeout waiting for MCP tool ${toolName} to respond`));
    }, 180000); // 3 minutes timeout

    try {
      console.log(`🔌 Attempting to connect to SSE: ${sseUrl.replace(apiToken, '<APIFY_TOKEN_HIDDEN>')}`);
      eventSource = new EventSource(sseUrl);
    } catch (e) {
      console.error(`❌ SSE Connection Error (initial): ${e.message}`);
      reject(new Error(`Failed to initiate SSE connection: ${e.message}`));
      return;
    }
    
    eventSource.onopen = () => {
      console.log(`✅ SSE connection opened for ${jsonRpcId} (${toolName})`);
    };

    eventSource.onerror = (error) => {
      console.error(`❌ SSE Error for ${jsonRpcId} (${toolName}):`, error.message || error);
      if (eventSource.readyState === EventSource.CONNECTING) {
        console.error(`SSE failed to connect. Ensure MCP server URL (${MCP_SERVER_URL}) is correct, accessible, and the token is valid.`);
      }
      cleanup();
      reject(new Error(`SSE error with MCP tool ${toolName}: ${error.message || 'Unknown SSE error'}`));
    };

    eventSource.addEventListener('endpoint', async (event) => {
      try {
        const endpointData = event.data;
        console.log(`🔗 Received endpoint for ${jsonRpcId}: ${endpointData}`);
        
        if (!endpointData || !endpointData.includes('sessionId=')) {
          throw new Error('Invalid endpoint data received from MCP server.');
        }
        const sessionId = endpointData.split('sessionId=')[1];
        if (!sessionId) {
          throw new Error('Could not extract sessionId from endpoint data.');
        }

        // Construct message URL with the apiToken
        const messageUrl = `${MCP_SERVER_URL}/message?token=${apiToken}&session_id=${sessionId}`;
        const payload = {
          jsonrpc: '2.0',
          id: jsonRpcId,
          method: 'tools/call',
          params: { name: toolName, arguments: toolInput },
        };

        console.log(`📤 Sending tool_call to ${messageUrl.replace(apiToken, '<APIFY_TOKEN_HIDDEN>')} for ${jsonRpcId}`);
        const postResponse = await fetch(messageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!postResponse.ok) {
          const errorText = await postResponse.text();
          console.error(`❌ MCP tool_call POST failed for ${jsonRpcId} (${toolName}): ${postResponse.status}`, errorText);
          throw new Error(`MCP tool_call POST failed: ${postResponse.status} - ${errorText}`);
        }
        const responseText = await postResponse.text();
        console.log(`👍 MCP tool_call POST successful for ${jsonRpcId} (${toolName}): ${responseText}`); // Usually "Accepted" or similar

      } catch (e) {
        console.error(`❌ Error during 'endpoint' event handling or POSTing for ${jsonRpcId}: ${e.message}`);
        cleanup();
        reject(e);
      }
    });

    eventSource.addEventListener('message', (event) => {
      try {
        // console.log(`📩 SSE Message received for ${jsonRpcId} (${toolName}): ${event.data.substring(0, 200)}...`); // Can be very verbose
        const messageData = JSON.parse(event.data);

        if (messageData.id === jsonRpcId && messageData.result) {
          console.log(`🎉 Result received for ${jsonRpcId} (${toolName})!`);
          cleanup();
          resolve(messageData.result); 
        } else if (messageData.id === jsonRpcId && messageData.error) {
          console.error(`❌ Error result from MCP tool for ${jsonRpcId} (${toolName}):`, messageData.error);
          cleanup();
          reject(new Error(`MCP tool ${toolName} returned error: ${messageData.error.message || JSON.stringify(messageData.error)}`));
        } else {
          // console.log(`Ignoring message for other ID or type: ${messageData.id}`);
        }
      } catch (e) {
        console.error(`❌ Error parsing SSE message for ${jsonRpcId} (${toolName}): ${e.message}. Data: ${event.data.substring(0,200)}...`);
        // Don't reject here, could be other messages on the stream. Only reject on error for *our* ID.
      }
    });
  });
}

// This function is now designed to take the actual array of items from a dataset
function normalizeAndStructureDatasetItems(datasetItems, sourceToolName) {
  console.log(`Normalizing ${datasetItems.length} dataset items from tool: ${sourceToolName}`);
  let properties = [];

  if (!Array.isArray(datasetItems)) {
    console.warn(`Expected an array of dataset items for ${sourceToolName}, but received:`, typeof datasetItems);
    return [];
  }

  if (datasetItems.length > 0) {
    console.log("Inspecting first raw item from dataset (normalizeAndStructureDatasetItems):", JSON.stringify(datasetItems[0], null, 2));
  }

  datasetItems.forEach(item => {
    let imageUrls = [];

    // Attempt 1: item.photos (array of strings or objects)
    if (Array.isArray(item.photos) && item.photos.length > 0) {
      console.log(`Item ${item.zpid || item.id}: Found item.photos array.`);
      imageUrls = item.photos.map(p => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          return p.url || p.href || p.desktop || p.high || p.medium || p.thumb;
        }
        return null;
      }).filter(url => url);
    } 
    // Attempt 2: item.media.photo (object with different sizes) - Based on Zillow output
    else if (item.media && item.media.photo && typeof item.media.photo === 'object') {
      console.log(`Item ${item.zpid || item.id}: Found item.media.photo object.`);
      const photoData = item.media.photo;
      const potentialUrls = [
        photoData.high, // Prioritize high-resolution
        photoData.desktop,
        photoData.medium,
        photoData.thumb
        // Add any other variants if they exist, e.g., photoData.original
      ];
      potentialUrls.forEach(url => {
        if (url && typeof url === 'string') {
          imageUrls.push(url);
        }
      });
    }
    // Attempt 3: item.imgSrc (single string URL)
    else if (typeof item.imgSrc === 'string') {
      console.log(`Item ${item.zpid || item.id}: Found item.imgSrc string.`);
      imageUrls.push(item.imgSrc);
    }
    // Attempt 4: item.image (single string URL)
    else if (item.image && typeof item.image === 'string') {
      console.log(`Item ${item.zpid || item.id}: Found item.image string.`);
      imageUrls.push(item.image);
    }
    // Attempt 5: item.Media (array of objects with a .url property)
    else if (Array.isArray(item.Media) && item.Media.length > 0) {
      console.log(`Item ${item.zpid || item.id}: Found item.Media array.`);
      imageUrls = item.Media.map(m => m.url).filter(url => url);
    }
    // Attempt 6: item.hdpData.homeInfo.photos (Zillow specific deep structure)
    else if (item.zpid && item.hdpData?.homeInfo?.photos) {
      console.log(`Item ${item.zpid || item.id}: Found item.hdpData.homeInfo.photos.`);
      const hdpPhotos = item.hdpData.homeInfo.photos;
      if (Array.isArray(hdpPhotos)) {
        imageUrls = hdpPhotos.flatMap(p => { // Use flatMap to handle nested arrays of URLs
          if (p.mixedSources && p.mixedSources.jpeg && Array.isArray(p.mixedSources.jpeg)) {
            return p.mixedSources.jpeg.map(jpegInfo => jpegInfo.url); // Collect all jpeg URLs
          }
          return []; // Return empty array if structure is not as expected
        }).filter(url => url);
      }
    }

    // Ensure unique, valid HTTP(S) URLs
    imageUrls = [...new Set(imageUrls.filter(url => url && typeof url === 'string' && url.startsWith('http')))];
    
    if (imageUrls.length > 0) {
      console.log(`Item ${item.zpid || item.id}: Successfully extracted ${imageUrls.length} image URLs. First one: ${imageUrls[0]}`);
    } else {
      console.log(`Item ${item.zpid || item.id}: No image URLs extracted after all attempts. Raw item:`, JSON.stringify(item, null, 2).substring(0, 500) + "...");
    }

    const normalizedProperty = {
      id: String(item.zpid || item.id || item.ZPID || item.URL || `mcp-${Math.random().toString(36).substr(2, 9)}`),
      source: sourceToolName,
      title: item.streetAddress || item.Title || item.address?.streetAddress || (typeof item.address === 'string' ? item.address : 'N/A'),
      price: String(item.price?.value || item.price?.data?.price || item.price?.slice(-1)[0]?.price || item.price || item.Price || 'N/A'),
      priceNumeric: parseFloat(String(item.price?.value || item.price?.data?.price || item.price?.slice(-1)[0]?.price || item.price || item.Price || '0').replace(/[^0-9.]+/g, '')) || 0,
      location: item.regionString || item.city || item.Location || (item.address?.city ? `${item.address.city}, ${item.address.state}` : 'N/A'),
      address: item.streetAddress || item.address?.streetAddress || (typeof item.Address === 'string' ? item.Address : 'N/A'),
      city: item.city || item.address?.city || 'N/A',
      state: item.state || item.address?.state || '',
      zipCode: String(item.zipcode || item.address?.zipcode || ''),
      bedrooms: parseInt(String(item.bedrooms || item.beds || item.Bedrooms || item.bed || '0').match(/\d+/)?.[0] || '0'),
      bathrooms: parseFloat(String(item.bathrooms || item.baths || item.Bathrooms || item.bath || '0').match(/[\d.]+/)?.[0] || '0'),
      area: String(item.livingArea?.value || item.livingArea || item.sqft || item.Area || 'N/A'),
      areaNumeric: parseFloat(String(item.livingArea?.value || item.livingArea || item.sqft || item.Area || '0').replace(/[^0-9.]+/g, '')) || 0,
      images: imageUrls, // Use the extracted image URLs
      description: item.description || item.Description || '',
      url: item.detailUrl || item.URL || item.url || `https://www.zillow.com/homedetails/${item.zpid}_zpid/`, // Construct Zillow URL if only ZPID is available
      propertyType: item.propertyType || item.homeType || item.PropertyType || 'N/A',
      homeStatus: item.homeStatus || item.HomeStatus || 'N/A',
      scrapedAt: new Date().toISOString(),
      features: Array.isArray(item.features) ? item.features : [],
      amenities: Array.isArray(item.amenities) ? item.amenities : [],
      contactInfo: item.contactPhone || item.brokerName ? { phone: item.contactPhone, agentName: item.brokerName } : undefined,
      coordinates: item.latLong ? { lat: item.latLong.latitude, lng: item.latLong.longitude } : (item.latitude && item.longitude ? { lat: item.latitude, lng: item.longitude } : undefined),
    };
    
    if (sourceToolName.toLowerCase().includes('zillow')) {
      const status = String(normalizedProperty.homeStatus).toUpperCase();
      if (status && status !== 'FOR_RENT' && status !== 'RENT' && status !== 'APARTMENT_COMMUNITY' && status !== 'APARTMENTS') {
         console.log(`Skipping Zillow property not for rent: ${normalizedProperty.title} (Status: ${normalizedProperty.homeStatus})`);
         return;
      }
      // Ensure Zillow properties have a Zillow URL if only ZPID is present
      if (!normalizedProperty.url.startsWith('http') && item.zpid) {
        normalizedProperty.url = `https://www.zillow.com/homedetails/${item.zpid}_zpid/`;
      }
    }
    
    if (!normalizedProperty.priceNumeric || !normalizedProperty.title || normalizedProperty.title === 'N/A') {
        return;
    }

    properties.push(normalizedProperty);
  });
  
  const uniqueProperties = deduplicateProperties(properties);
  console.log(`Normalization resulted in ${uniqueProperties.length} unique properties from ${datasetItems.length} items.`);
  return uniqueProperties;
}

function deduplicateProperties(properties) {
  const unique = [];
  const seen = new Set();
  for (const prop of properties) {
    const key = `${(prop.address || prop.title || '').toLowerCase()}-${prop.priceNumeric}-${(prop.location || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(prop);
    }
  }
  return unique;
}

async function fetchPropertiesViaMCP(toolName, toolInput) {
  console.log(`ℹ️ Attempting to fetch properties via MCP tool: ${toolName}`);
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.error('❌ Apify token not configured. MCP interaction will fail.');
    throw new Error('Apify token not configured for MCP');
  }
  if (!toolName || typeof toolInput === 'undefined') {
    console.error('❌ toolName and toolInput are required for fetchPropertiesViaMCP.');
    throw new Error('toolName and toolInput are required.');
  }

  try {
    const rawMcpResult = await callApifyMCPTool(toolName, toolInput, apifyToken);
    console.log(`✅ Raw result from MCP tool ${toolName} received in fetchPropertiesViaMCP.`);
    // console.log("Raw MCP Result Full:", JSON.stringify(rawMcpResult, null, 2)); // Uncomment for deep debugging

    let datasetId = null;
    let runId = null;

    if (rawMcpResult && rawMcpResult.content && Array.isArray(rawMcpResult.content)) {
      for (const item of rawMcpResult.content) {
        if (item.type === 'text' && item.text) {
          const textContent = item.text;
          // console.log(`MCP text content from ${toolName}:`, textContent.substring(0, 500));

          const runIdRegex = /"runId":"([^"]+)"|"id":"([^"]+)"/i; // For run info
          const datasetIdRegex = /"datasetId":"([^"]+)"|"defaultDatasetId":"([^"]+)"|Dataset information: {"id":"([^"]+)"/i;
          
          let runIdMatch = textContent.match(runIdRegex);
          let datasetIdMatch = textContent.match(datasetIdRegex);

          if (runIdMatch && !runId) runId = runIdMatch[1] || runIdMatch[2];
          if (datasetIdMatch && !datasetId) datasetId = datasetIdMatch[1] || datasetIdMatch[2] || datasetIdMatch[3];
          
          try {
            const parsedText = JSON.parse(textContent);
            if (parsedText.runId && !runId) runId = parsedText.runId;
            if (parsedText.actorRunId && !runId) runId = parsedText.actorRunId;
            if (parsedText.datasetId && !datasetId) datasetId = parsedText.datasetId;
            if (parsedText.defaultDatasetId && !datasetId) datasetId = parsedText.defaultDatasetId;
            
            if (Array.isArray(parsedText)) {
                console.log(`MCP result for ${toolName} is a direct array of items. Normalizing directly.`);
                return normalizeAndStructureDatasetItems(parsedText, toolName);
            }
          } catch (e) { /* Not direct JSON or not the one we need */ }
        }
      }
    }
    
    console.log(`Extracted from MCP response for ${toolName} - Run ID: ${runId}, Dataset ID: ${datasetId}`);

    if (datasetId) {
      console.log(`Fetching items from Dataset ID: ${datasetId} for tool ${toolName}`);
      const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&clean=true&limit=50`; // Limit to 50 for now
      
      const response = await fetch(datasetUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch dataset items for ${datasetId}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch dataset items: ${response.status}`);
      }
      const datasetItems = await response.json();
      console.log(`✅ Successfully fetched ${datasetItems.length} items from dataset ${datasetId} for ${toolName}.`);
      
      return normalizeAndStructureDatasetItems(datasetItems, toolName);

    } else {
      console.warn(`Could not determine datasetId from MCP response for tool ${toolName}. Attempting to normalize rawMcpResult directly if it's an array.`);
      if (rawMcpResult && rawMcpResult.content && Array.isArray(rawMcpResult.content) && rawMcpResult.content[0]?.type === 'text' && rawMcpResult.content[0]?.text) {
        try {
          const potentialDirectResults = JSON.parse(rawMcpResult.content[0].text);
          if (Array.isArray(potentialDirectResults)) {
            console.log(`Treating raw MCP text content as direct results array for ${toolName}.`);
            return normalizeAndStructureDatasetItems(potentialDirectResults, toolName);
          }
        } catch (e) {
          console.warn(`Raw MCP text for ${toolName} was not a direct JSON array of results. Content preview: ${rawMcpResult.content[0].text.substring(0,200)}`);
        }
      }
      console.log(`No dataset ID found and no direct array in MCP response for ${toolName}. Returning empty array.`);
      return [];
    }

  } catch (error) {
    console.error(`❌ Error in fetchPropertiesViaMCP for tool ${toolName}:`, error);
    // Log the error details for better debugging
    if (error.response && typeof error.response.text === 'function') {
      const errorText = await error.response.text();
      console.error("Underlying error response text:", errorText);
    }
    return []; 
  }
}

// MCP-powered property search endpoint
// IMPORTANT: This endpoint now expects `toolName` and `toolInput` in the request body,
// which should be determined by Claude and sent from `aiService.ts`.
app.post('/api/properties/mcp-search', async (req, res) => {
  try {
    const { toolName, toolInput, criteria } = req.body; // `criteria` might still be sent by frontend for context, but toolName/Input are primary
    console.log('🚀 MCP Property search request received (MCP-only path):', 
                JSON.stringify({ toolName, toolInputIsObject: typeof toolInput === 'object', criteria }, null, 2));
    
    if (!toolName || typeof toolInput === 'undefined') { // toolInput can be null or empty object
      return res.status(400).json({ 
        error: 'toolName and toolInput are required for MCP property search'
      });
    }

    if (!process.env.APIFY_TOKEN) {
      return res.status(500).json({ error: 'Apify token not configured' });
    }

    console.log(`🔍 Delegating to fetchPropertiesViaMCP for tool: ${toolName}...`);
    const properties = await fetchPropertiesViaMCP(toolName, toolInput);
    
    console.log(`✅ MCP-based property search completed via ${toolName}, found ${properties.length} properties`);
    res.json({ properties });
    
  } catch (error) {
    console.error('❌ Property search error (MCP-only path):', error);
    res.status(500).json({ 
      error: 'Property search failed (MCP-only path)', 
      message: error.message 
    });
  }
});

// The direct actor call functions (searchWithWorkingActors, runSingleActor, 
// waitForActorCompletion, normalizePropertyData, deduplicateProperties, 
// extractNumericPrice, extractNumericArea) have been removed as per the request
// to only use MCP.

app.listen(PORT, () => {
  console.log(`🚀 Property Whisperer Backend with Claude MCP running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  console.log('\n📋 Configuration Status:');
  console.log('- Anthropic API Key:', process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('- Apify Token:', process.env.APIFY_TOKEN ? '✅ Configured' : '❌ Missing');
  
  console.log('\n🎯 Claude MCP Integration:');
  console.log('- Claude Tool Calling: ✅ Enabled');
  console.log('- Backend Property Search: Now uses MCP-only path (placeholder implementation)');
  
  if (!process.env.APIFY_TOKEN) {
    console.log('\n⚠️  Get your Apify token from: https://console.apify.com/account/integrations');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠️  Get your Anthropic API key from: https://console.anthropic.com/');
  }
}); 