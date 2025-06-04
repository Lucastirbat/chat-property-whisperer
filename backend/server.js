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
  // REVERTED: Use your specific MCP Server Task URL (base path)
  const MCP_SERVER_URL = 'https://lucastirbat--property-search-mcp-server.apify.actor'; 
  const jsonRpcId = `chatprop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  console.log(`📞 Calling MCP tool: ${toolName} via YOUR dedicated MCP Server Task (${MCP_SERVER_URL}) with ID: ${jsonRpcId}`);

  if (!apiToken) {
    console.error('❌ API token is missing for MCP call.');
    return Promise.reject(new Error('Apify API token is required for MCP communication.'));
  }

  return new Promise((resolve, reject) => {
    // Construct SSE URL with the provided apiToken in the query
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
    }, 600000); // 10 minutes timeout

    try {
      console.log(`🔌 Attempting to connect to SSE: ${sseUrl.replace(apiToken, '<APIFY_TOKEN_HIDDEN>')}`);
      // Initialize EventSource without custom headers (token is in URL)
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
      console.error(`❌ SSE Error for ${jsonRpcId} (${toolName}):`, error);
      if (eventSource.readyState === EventSource.CONNECTING) {
        console.error(`SSE failed to connect. Ensure MCP server URL (${MCP_SERVER_URL}) is correct, accessible, and the token is valid.`);
      }
      cleanup();
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : (error ? JSON.stringify(error) : 'Unknown SSE error');
      reject(new Error(`SSE error with MCP tool ${toolName}: ${errorMessage}`));
    };

    eventSource.addEventListener('endpoint', async (event) => {
      try {
        const endpointData = event.data;
        console.log(`🔗 Received endpoint for ${jsonRpcId}: ${endpointData}`);
        
        // Original validation for custom MCP server endpoint data
        if (!endpointData || !endpointData.includes('sessionId=')) { 
          throw new Error(`Invalid endpoint data received from MCP server: ${endpointData}`);
        }
        const sessionId = endpointData.split('sessionId=')[1];
        if (!sessionId) {
          throw new Error('Could not extract sessionId from endpoint data.');
        }

        // Construct message URL with the apiToken and sessionId in the query for custom MCP server
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
          headers: { 
            'Content-Type': 'application/json'
            // No Authorization header needed here, token is in URL for custom MCP server
          },
          body: JSON.stringify(payload),
        });

        if (!postResponse.ok) {
          const errorText = await postResponse.text();
          console.error(`❌ MCP tool_call POST failed for ${jsonRpcId} (${toolName}): ${postResponse.status}`, errorText);
          throw new Error(`MCP tool_call POST failed: ${postResponse.status} - ${errorText}`);
        }
        const responseText = await postResponse.text();
        console.log(`👍 MCP tool_call POST successful for ${jsonRpcId} (${toolName}): ${responseText}`); 

      } catch (e) {
        console.error(`❌ Error during 'endpoint' event handling or POSTing for ${jsonRpcId}: ${e.message}`);
        cleanup();
        reject(e);
      }
    });

    eventSource.addEventListener('message', (event) => {
      try {
        console.log(`📩 SSE Message received for ${jsonRpcId} (${toolName}): ${event.data.substring(0, 300)}...`);
        const messageData = JSON.parse(event.data);

        let extractedRunId = null;
        let extractedDatasetId = null;

        if (messageData.id === jsonRpcId) {
          if (messageData.error) {
            console.error(`❌ Error result from MCP tool for ${jsonRpcId} (${toolName}):`, messageData.error);
            cleanup();
            reject(new Error(`MCP tool ${toolName} returned error: ${messageData.error.message || JSON.stringify(messageData.error)}`));
            return;
          }

          if (messageData.result) {
            console.log(`Received result object for ${jsonRpcId}, attempting to extract IDs.`);
            // Look for IDs in the main result object
            if (messageData.result.runId) extractedRunId = messageData.result.runId;
            if (messageData.result.actorRunId) extractedRunId = messageData.result.actorRunId; // Alternative key
            if (messageData.result.datasetId) extractedDatasetId = messageData.result.datasetId;
            if (messageData.result.defaultDatasetId) extractedDatasetId = messageData.result.defaultDatasetId; // Alternative key

            // Check inside result.content[0].text if it exists (common pattern for nested JSON)
            if (messageData.result.content && Array.isArray(messageData.result.content) && messageData.result.content.length > 0) {
              const firstContent = messageData.result.content[0];
              if (firstContent.type === 'text' && firstContent.text) {
                console.log(`Attempting to parse result.content[0].text for IDs for ${jsonRpcId}`);
                let jsonToParse = firstContent.text;
                const runInfoPrefix = "Actor finished with run information: ";
                if (firstContent.text.startsWith(runInfoPrefix)) {
                  const jsonStartIndex = firstContent.text.indexOf('{');
                  if (jsonStartIndex !== -1) {
                    jsonToParse = firstContent.text.substring(jsonStartIndex);
                    console.log(`Extracted JSON string from prefix: ${jsonToParse.substring(0,100)}...`);
                  } else {
                    console.warn(`Prefix "${runInfoPrefix}" found but no '{' followed. Treating as non-JSON text.`);
                    jsonToParse = null; // Cannot parse
                  }
                }

                if (jsonToParse) {
                  try {
                    const innerResult = JSON.parse(jsonToParse);
                    // For actor run information, the runId is usually 'id' and datasetId is 'defaultDatasetId'
                    if (innerResult.id) extractedRunId = extractedRunId || innerResult.id;
                    if (innerResult.defaultDatasetId) extractedDatasetId = extractedDatasetId || innerResult.defaultDatasetId;
                    
                    // Also check for other common ID keys, just in case
                    if (innerResult.runId) extractedRunId = extractedRunId || innerResult.runId;
                    if (innerResult.actorRunId) extractedRunId = extractedRunId || innerResult.actorRunId;
                    if (innerResult.datasetId) extractedDatasetId = extractedDatasetId || innerResult.datasetId;

                    if (Array.isArray(innerResult)) {
                      console.warn(`Inner result for ${jsonRpcId} is an array. ID extraction from run info might fail if not structured as expected.`);
                    }
                  } catch (e) {
                    console.warn(`Could not parse extracted/direct JSON from result.content[0].text for ${jsonRpcId}: ${e.message}. Original text: ${firstContent.text.substring(0,200)}`);
                  }
                }
              }
            }
            
            if (extractedRunId || extractedDatasetId) {
              console.log(`🎉 Extracted IDs for ${jsonRpcId} (${toolName}) - Run ID: ${extractedRunId}, Dataset ID: ${extractedDatasetId}`);
              cleanup(); // We got what we needed (IDs), so clean up SSE
              resolve({ runId: extractedRunId, datasetId: extractedDatasetId });
              return;
            } else {
              // If we received a result for our ID, but no specific IDs, this is an error from MCP.
              console.error(`❌ MCP tool ${toolName} (ID: ${jsonRpcId}) sent a result but required IDs (runId/datasetId) were not found. This is an issue with the MCP server response.`);
              console.error(`Full result from MCP for ${jsonRpcId}:`, JSON.stringify(messageData.result, null, 2).substring(0, 1000));
              cleanup();
              reject(new Error(`MCP tool ${toolName} (ID: ${jsonRpcId}) provided a result missing pollable runId/datasetId.`));
              return;
            }
          }
        } else {
          console.log(`Ignoring SSE message for a different ID or type: ${messageData.id}`);
        }
      } catch (e) {
        console.error(`❌ Error parsing SSE message for ${jsonRpcId} (${toolName}): ${e.message}. Data: ${event.data.substring(0,200)}...`);
        // Don't reject here, could be other messages on the stream for other IDs. Only if error for *our* ID.
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
    console.warn('Dataset items (first 500 chars if not array):', String(datasetItems).substring(0,500));
    return [];
  }

  if (datasetItems.length > 0) {
    if (sourceToolName.toLowerCase().includes('zillow') || sourceToolName.toLowerCase().includes('apartments-scraper') || sourceToolName.toLowerCase().includes('realtor-scraper')) {
      console.log(`Inspecting first raw item from ${sourceToolName}:`, JSON.stringify(datasetItems[0], null, 2).substring(0, 1000) + '...');
    }
  }

  datasetItems.forEach(item => {
    let imageUrls = [];
    let bedrooms = 0;
    let bathrooms = 0;
    let propertyType = 'N/A';
    let description = item.description || item.text || ''; // General default
    let price = 'N/A';
    let priceNumeric = 0;
    let location = 'N/A';
    let city = 'N/A';
    let state = 'N/A';
    let address = 'N/A';
    let zipCode = '';
    let area = 'N/A';
    let areaNumeric = 0;
    let url = item.url || '#';
    let amenities = [];
    let features = [];
    let coordinates = undefined;
    let title = 'N/A'; // General default
    let homeStatus = item.homeStatus || item.HomeStatus || item.status || 'N/A';
    let scrapedAt = item.scrapedAt || item.datetime || new Date().toISOString();

    // Scraper-specific normalization
    if (sourceToolName && sourceToolName.toLowerCase().includes('apartments-scraper')) {
      title = item.propertyName || 'N/A';
      if (item.rent) {
        if (item.rent.min && item.rent.max && item.rent.min !== item.rent.max) {
          price = `$${item.rent.min} - $${item.rent.max}`;
        } else if (item.rent.min) {
          price = `$${item.rent.min}`;
        } else if (item.rent.max) {
          price = `$${item.rent.max}`;
        }
        priceNumeric = parseFloat(item.rent.min || item.rent.max || 0);
      }
      if (item.location) {
        address = item.location.streedAddress || 'N/A';
        city = item.location.city || 'N/A';
        state = item.location.state || 'N/A';
        zipCode = item.location.postalCode || '';
        location = item.location.fullAddress || `${address}, ${city}, ${state}`.replace(/^, |, $/g, '').replace(/^,|, $/g, '');
        if (location === ', , ') location = 'N/A';
      }
      if (item.beds) {
        const bedString = String(item.beds).toLowerCase();
        if (bedString.includes('studio')) bedrooms = 0;
        else {
          const match = bedString.match(/(\d+)/);
          if (match) bedrooms = parseInt(match[1]);
        }
      }
      if (item.baths) {
        const bathString = String(item.baths).toLowerCase();
        const match = bathString.match(/(\d*\.?\d+)/);
        if (match) bathrooms = parseFloat(match[1]);
      }
      area = item.sqft || 'N/A';
      if (item.sqft && typeof item.sqft === 'string') {
        areaNumeric = parseFloat(item.sqft.replace(/[^0-9.-]+/g, '').split('-')[0].trim()) || 0;
      }
      if (Array.isArray(item.photos)) {
        imageUrls = item.photos.filter(p => typeof p === 'string' && p.startsWith('http'));
      }
      description = item.description || '';
      url = item.url || '#';
      if(item.coordinates) coordinates = { lat: item.coordinates.latitude, lng: item.coordinates.longitude };
      propertyType = 'apartment'; // Default for apartments.com
      if (Array.isArray(item.amenities)) {
        item.amenities.forEach(group => {
          if (group && Array.isArray(group.value)) {
            amenities = amenities.concat(group.value);
          }
        });
      }
      scrapedAt = item.scrapedAt || new Date().toISOString();
      // After processing, push the single normalized property and prevent fall-through
      // (This block already creates one property from one item, so the existing structure is okay, 
      // but we need to ensure it doesn't fall through if we consider it fully handled)
      // For consistency with other blocks that might return early, we can consider adding a mechanism
      // or ensure the default block is truly a catch-all for *unhandled* items.
      // However, the immediate issue is with apartmentlist-scraper creating multiple properties and then its parent item being re-processed.

    } else if (sourceToolName && sourceToolName.toLowerCase().includes('realtor-scraper')) {
      title = item.name || item.address?.street || 'N/A'; // Prefer item.name if available
      // Try item.listPrice, then item.price (more general), then item.lastSoldPrice as fallbacks
      price = String(item.listPrice || item.price || item.lastSoldPrice || 'N/A'); 
      priceNumeric = parseFloat(String(item.listPrice || item.price || item.lastSoldPrice || '0').replace(/[^0-9.]+/g, '')) || 0;
      if(item.address) {
        address = item.address.street || 'N/A';
        city = item.address.locality || 'N/A';
        state = item.address.region || 'N/A';
        zipCode = item.address.postalCode || '';
        location = `${address}, ${city}, ${state}`.replace(/^, |, $/g, '').replace(/^,|, $/g, '');
        if (location === ', , ') location = 'N/A';
      }
      bedrooms = parseInt(item.beds || '0');
      bathrooms = parseFloat(item.baths_total || item.baths || '0');
      area = String(item.sqft || 'N/A');
      areaNumeric = parseFloat(String(item.sqft || '0').replace(/[^0-9.]+/g, '')) || 0;
      if (Array.isArray(item.photos) && item.photos.length > 0) {
        imageUrls = item.photos.map(p => (typeof p === 'string' ? p : p?.href)).filter(u => u && u.startsWith('http'));
      } else if (item.history && Array.isArray(item.history) && item.history.length > 0 && item.history[0].listing && Array.isArray(item.history[0].listing.photos)) {
         imageUrls = item.history[0].listing.photos.map(p => p?.href).filter(u => u && u.startsWith('http'));
      }
      description = (item.description?.text || item.text || item.history?.[0]?.listing?.description?.text || '');
      url = item.url || '#';
      if(item.coordinates) coordinates = { lat: item.coordinates.latitude, lng: item.coordinates.longitude };
      propertyType = item.type || 'N/A';
      homeStatus = item.status || 'N/A'; // realtor uses item.status
      if(item.cooling) features.push(`Cooling: ${item.cooling}`);
      if(item.heating) features.push(`Heating: ${item.heating}`);
      if(item.fireplace && item.fireplace.toLowerCase() !== 'no') features.push('Fireplace');
      if(item.pool && item.pool.toLowerCase() !== 'no') features.push('Pool');
      if(item.garage_type) features.push(`Garage: ${item.garage_type}`);
      if(item.exterior) features.push(`Exterior: ${item.exterior}`);
      scrapedAt = new Date().toISOString(); // Realtor sample doesn't have scrapedAt
      // Similar to apartments-scraper, this creates one property. We need to avoid fall-through.

    } else if (sourceToolName && sourceToolName.toLowerCase().includes('apartmentlist-scraper')) {
      // Normalization for epctex/apartmentlist-scraper
      // Each 'item' can have multiple 'units'. We'll create a property for each unit.
      if (item.units && Array.isArray(item.units)) {
        item.units.forEach(unit => {
          const propertyName = item.propertyName || 'N/A';
          const unitName = unit.name || unit.remoteListingId || unit.id;
          const title = unitName ? `${propertyName} - Unit ${unitName}` : propertyName;

          let unitPrice = String(unit.price || 'N/A');
          let unitPriceNumeric = parseFloat(String(unit.price || '0').replace(/[^0-9.]+/g, '')) || 0;
          
          let unitBedrooms = 0;
          if (unit.bed !== undefined && unit.bed !== null) {
              const bedStr = String(unit.bed).toLowerCase();
              if (bedStr === 'studio' || bedStr === 's') {
                  unitBedrooms = 0;
              } else {
                  const bedMatch = bedStr.match(/\d+/);
                  if (bedMatch) unitBedrooms = parseInt(bedMatch[0]);
              }
          }

          let unitBathrooms = 0;
           if (unit.bath !== undefined && unit.bath !== null) {
              const bathMatch = String(unit.bath).match(/[\d.]+/);
              if (bathMatch) unitBathrooms = parseFloat(bathMatch[0]);
          }


          let unitArea = String(unit.sqft || 'N/A');
          let unitAreaNumeric = parseFloat(String(unit.sqft || '0').replace(/[^0-9.]+/g, '')) || 0;

          let unitImages = [];
          if (Array.isArray(unit.photos) && unit.photos.length > 0) {
            unitImages = unit.photos.filter(p => typeof p === 'string' && p.startsWith('http'));
          }
          if (unitImages.length === 0 && Array.isArray(item.photos)) {
            unitImages = item.photos.filter(p => typeof p === 'string' && p.startsWith('http'));
          }
          
          let unitLocation = 'N/A';
          let unitAddress = 'N/A';
          let unitCity = 'N/A';
          let unitState = 'N/A';
          let unitZipCode = '';

          if (item.location) {
            unitAddress = item.location.streetAddress || item.location.streedAddress || 'N/A';
            unitCity = item.location.city || 'N/A';
            unitState = item.location.state || 'N/A';
            unitZipCode = item.location.postalCode || '';
            unitLocation = item.location.fullAddress || `${unitAddress}, ${unitCity}, ${unitState}`.replace(/^, |, $/g, '').replace(/^,|, $/g, '');
            if (unitLocation === ', , ') unitLocation = 'N/A';
          }

          const normalizedUnitProperty = {
            id: String(item.id ? `${item.id}-${unit.id || unit.remoteListingId}` : `aptlist-${unit.id || unit.remoteListingId || Math.random().toString(36).substr(2, 9)}`),
            source: sourceToolName,
            title: title,
            price: unitPrice,
            priceNumeric: unitPriceNumeric,
            location: unitLocation,
            address: unitAddress,
            city: unitCity,
            state: unitState,
            zipCode: unitZipCode,
            bedrooms: unitBedrooms,
            bathrooms: unitBathrooms,
            area: unitArea,
            areaNumeric: unitAreaNumeric,
            images: [...new Set(unitImages)],
            description: item.description || '',
            url: unit.applyOnlineUrl || item.url || '#',
            propertyType: item.rentalType || 'apartment', // Assuming 'apartment' if not specified
            homeStatus: unit.availability || (item.isActive ? 'active' : 'N/A'),
            scrapedAt: item.scrapedAt || new Date().toISOString(),
            features: [], // ApartmentList doesn't seem to have a direct 'features' array like others, amenities cover a lot.
            amenities: Array.isArray(item.amenities) ? [...new Set(item.amenities.filter(a => typeof a === 'string'))] : [],
            contactInfo: undefined, // No direct contact info in sample, may need to infer or skip
            coordinates: item.coordinates ? { lat: item.coordinates.latitude, lng: item.coordinates.longitude } : undefined,
            availability: unit.availableOn ? `Available from ${unit.availableOn}` : (unit.availability || undefined)
          };
          
          if (!normalizedUnitProperty.priceNumeric || normalizedUnitProperty.priceNumeric === 0 || !normalizedUnitProperty.title || normalizedUnitProperty.title === 'N/A') {
            console.log(`Skipping ApartmentList unit due to missing/invalid price or title: ${normalizedUnitProperty.title}, Price: ${normalizedUnitProperty.price} (Numeric: ${normalizedUnitProperty.priceNumeric})`);
            return; // Skip this unit
          }

          properties.push(normalizedUnitProperty);
        });
        return; // <--- ADD THIS RETURN to skip default processing for the parent item
      } else {
        // Handle cases where an item might not have units (though typical for ApartmentList)
        // Or create a single property from the main item if it makes sense
        console.warn(`ApartmentList item ${item.id || item.url} did not have a 'units' array. Skipping direct item processing, property requires units.`);
        return; // <--- ADD THIS RETURN to skip default processing if no units and we decide to skip
      }
    } else { // Default for Zillow (jupri-slash-zillow-scraper) and others
      title = item.title || item.streetAddress || item.Title || item.address?.streetAddress || (typeof item.address === 'string' ? item.address : 'N/A');
      price = String(item.price?.value || item.price?.data?.price || item.price?.slice(-1)[0]?.price || item.price || item.Price || 'N/A');
      priceNumeric = parseFloat(String(item.price?.value || item.price?.data?.price || item.price?.slice(-1)[0]?.price || item.price || item.Price || '0').replace(/[^0-9.]+/g, '')) || 0;
      location = (() => {
        if (typeof item.location === 'object' && item.location !== null) {
          if (item.regionString && typeof item.regionString === 'string') return item.regionString;
          if (item.address?.city && item.address?.state) return `${item.address.city}, ${item.address.state}`;
          if (item.city && item.state) return `${item.city}, ${item.state}`;
          return 'N/A'; 
        } else if (typeof item.location === 'string' && item.location.trim() !== '') {
          return item.location;
        } else {
          if (item.regionString && typeof item.regionString === 'string') return item.regionString;
          if (item.address?.city && item.address?.state) return `${item.address.city}, ${item.address.state}`;
          if (item.city && item.state) return `${item.city}, ${item.state}`;
          if (item.Location && typeof item.Location === 'string') return item.Location;
          return 'N/A';
        }
      })();
      address = item.address?.streetAddress || item.streetAddress || (typeof item.Address === 'string' ? item.Address : 'N/A');
      city = item.city || item.address?.city || 'N/A';
      state = item.state || item.address?.state || '';
      zipCode = String(item.zipcode || item.address?.zipcode || '');
      bedrooms = parseInt(String(item.bedrooms || item.beds || item.Bedrooms || item.bed || '0').match(/\d+/)?.[0] || '0');
      bathrooms = parseFloat(String(item.bathrooms || item.baths || item.Bathrooms || item.bath || '0').match(/[\d.]+/)?.[0] || '0');
      area = String(item.livingArea?.value || item.livingArea || item.sqft || item.Area || 'N/A');
      areaNumeric = parseFloat(String(item.livingArea?.value || item.livingArea || item.sqft || item.Area || '0').replace(/[^0-9.]+/g, '')) || 0;
      description = item.description || '';
      url = item.url || item.detailUrl || item.URL || (sourceToolName.toLowerCase().includes('zillow') && item.zpid ? `https://www.zillow.com/homedetails/${item.zpid}_zpid/` : '#');
      propertyType = item.propertyType || item.homeType || item.PropertyType || 'N/A';
      homeStatus = item.homeStatus || item.HomeStatus || 'N/A';
      scrapedAt = item.datetime || new Date().toISOString();
      if (item.latLong) coordinates = { lat: item.latLong.latitude, lng: item.latLong.longitude };
      else if (item.latitude && item.longitude) coordinates = { lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) };
      features = Array.isArray(item.features) ? item.features : (Array.isArray(item.attirbutes) ? item.attirbutes : []);
      amenities = Array.isArray(item.amenities) ? item.amenities : [];
      // Image extraction for Zillow & default
      if (Array.isArray(item.photos) && item.photos.length > 0) {
        imageUrls = item.photos.map(p => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object') { return p.url || p.href || p.desktop || p.high || p.medium || p.thumb; }
          return null;
        }).filter(u => u);
      } 
      else if (item.media?.photo && typeof item.media.photo === 'object') {
        const photoData = item.media.photo;
        [photoData.high, photoData.desktop, photoData.medium, photoData.thumb].forEach(u => { if (u && typeof u === 'string') imageUrls.push(u); });
      }
      else if (typeof item.imgSrc === 'string') imageUrls.push(item.imgSrc);
      else if (item.image && typeof item.image === 'string') imageUrls.push(item.image);
      else if (Array.isArray(item.Media) && item.Media.length > 0) imageUrls = item.Media.map(m => m.url).filter(u => u);
      else if (item.zpid && item.hdpData?.homeInfo?.photos && Array.isArray(item.hdpData.homeInfo.photos)) {
        imageUrls = item.hdpData.homeInfo.photos.flatMap(p => 
            (p.mixedSources?.jpeg && Array.isArray(p.mixedSources.jpeg)) ? p.mixedSources.jpeg.map(jpegInfo => jpegInfo.url) : []
        ).filter(u => u);
      }
    }

    imageUrls = [...new Set(imageUrls.filter(u => u && typeof u === 'string' && u.startsWith('http')))];
    
    const normalizedProperty = {
      id: String(item.id || item.zpid || item.ZPID || item.URL || `mcp-${sourceToolName.replace(/[^a-zA-Z0-9]/g, '_')}-${Math.random().toString(36).substr(2, 9)}`),
      source: sourceToolName,
      title: title,
      price: price,
      priceNumeric: priceNumeric,
      location: location,
      address: address,
      city: city,
      state: state,
      zipCode: zipCode,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      area: area,
      areaNumeric: areaNumeric,
      images: imageUrls, 
      description: description,
      url: url,
      propertyType: propertyType,
      homeStatus: homeStatus,
      scrapedAt: scrapedAt,
      features: [...new Set(features)], 
      amenities: [...new Set(amenities)], 
      contactInfo: item.contactPhone || item.brokerName ? { phone: item.contactPhone, agentName: item.brokerName } : (item.contact?.phone ? {phone: item.contact.phone} : undefined),
      coordinates: coordinates,
    };
    
    if (sourceToolName.toLowerCase().includes('zillow')) {
      const zillowStatus = String(normalizedProperty.homeStatus).toUpperCase();
      if (zillowStatus && zillowStatus !== 'FOR_RENT' && zillowStatus !== 'RENT' && zillowStatus !== 'APARTMENT_COMMUNITY' && zillowStatus !== 'APARTMENTS') {
         console.log(`Skipping Zillow property not for rent: ${normalizedProperty.title} (Status: ${normalizedProperty.homeStatus})`);
         return; 
      }
      if (!normalizedProperty.url.startsWith('http') && item.zpid) {
        normalizedProperty.url = `https://www.zillow.com/homedetails/${item.zpid}_zpid/`;
      }
    }
    if (sourceToolName.toLowerCase().includes('realtor-scraper')) {
        const realtorStatus = String(normalizedProperty.homeStatus).toLowerCase();
        // Assuming item.mode was passed down if we want to filter by it. For now, just check status.
        // For RENT mode, common statuses are 'for_rent', 'active', potentially others. 'sold', 'off_market' are not for rent.
        if (realtorStatus.includes('sold') || realtorStatus.includes('off_market') || realtorStatus.includes('pending')) {
            // This check might be too broad if we also allow 'BUY' mode for this scraper.
            // For now, if it looks like not actively for rent/sale, skip.
            console.log(`Skipping Realtor.com property with status: ${realtorStatus} for ${normalizedProperty.title}`);
            return; 
        }
    }

    if (!normalizedProperty.priceNumeric || normalizedProperty.priceNumeric === 0 || !normalizedProperty.title || normalizedProperty.title === 'N/A') {
        console.log(`Skipping property due to missing/invalid price or title: ${normalizedProperty.title}, Price: ${normalizedProperty.price} (Numeric: ${normalizedProperty.priceNumeric})`);
        return; 
    }

    properties.push(normalizedProperty);
  });
  
  const uniqueProperties = deduplicateProperties(properties);
  console.log(`Normalization for ${sourceToolName} resulted in ${uniqueProperties.length} unique properties from ${datasetItems.length} items.`);
  return uniqueProperties;
}

function deduplicateProperties(properties) {
  const unique = [];
  const seen = new Set();
  for (const prop of properties) {
    // Ensure that the components of the key are strings. 
    // prop.title is generally a good candidate for a string part of the address/description.
    // prop.address is also a good candidate if available and a string.
    const addressPart = typeof prop.address === 'string' ? prop.address : (typeof prop.title === 'string' ? prop.title : '');
    const locationString = typeof prop.location === 'string' ? prop.location : (typeof prop.city === 'string' ? prop.city : '');

    const key = `${addressPart.toLowerCase()}-${prop.priceNumeric}-${locationString.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(prop);
    }
  }
  return unique;
}

const POLLING_INTERVAL = 15000; // 15 seconds
const MAX_POLLING_DURATION = 9 * 60 * 1000; // 9 minutes, to fit within 10 min total timeout

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPropertiesViaMCP(toolName, toolInput) {
  console.log(`ℹ️ Attempting to fetch properties for tool: ${toolName} (strategy: MCP polling for all tools unless specified otherwise)`);
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.error('❌ Apify token not configured.');
    throw new Error('Apify token not configured');
  }
  if (!toolName || typeof toolInput === 'undefined') {
    console.error('❌ toolName and toolInput are required.');
    throw new Error('toolName and toolInput are required.');
  }

  // Map tool names from Claude (underscore_format) to MCP server (slash-format)
  let mcpToolName = toolName;
  if (toolName === 'jupri_zillow_scraper') {
    mcpToolName = 'jupri-slash-zillow-scraper';
  } else if (toolName === 'epctex_apartments_scraper') {
    mcpToolName = 'epctex-slash-apartments-scraper';
  } else if (toolName === 'epctex_realtor_scraper') {
    mcpToolName = 'epctex-slash-realtor-scraper';
  } else if (toolName === 'epctex_apartmentlist_scraper') {
    mcpToolName = 'epctex-slash-apartmentlist-scraper';
  }
  console.log(`ℹ️ Mapped tool name for MCP: ${toolName} -> ${mcpToolName}`);

  let finalToolInput = toolInput;
  // Remove specific input transformation for the old craigslist scraper
  // if (toolName === 'ivanvs-slash-craigslist-scraper') {
  //   if (toolInput && toolInput.searchUrls) {
  //     console.log(`Transforming input for ${toolName}: from searchUrls to urls`);
  //     finalToolInput = { urls: toolInput.searchUrls };
  //   }
  //   if (!finalToolInput.hasOwnProperty('maxItems')) {
  //     console.log(`Injecting default maxItems: 30 for ${toolName}`);
  //     finalToolInput.maxItems = 30;
  //   } else {
  //     console.log(`Using provided maxItems: ${finalToolInput.maxItems} for ${toolName}`);
  //   }
  //  // Direct Apify API call block for ivanvs-slash-craigslist-scraper is now removed.
  // }

  // Polling strategy for all tools by default
  let obtainedRunId = null;
  let obtainedDatasetId = null;

  try {
    console.log(`Calling callApifyMCPTool to get IDs for ${mcpToolName}...`);
    const ids = await callApifyMCPTool(mcpToolName, finalToolInput, apifyToken);
    obtainedRunId = ids.runId;
    obtainedDatasetId = ids.datasetId;
    console.log(`IDs received from callApifyMCPTool for ${mcpToolName}: RunID=${obtainedRunId}, DatasetID=${obtainedDatasetId}`);

    if (!obtainedRunId && !obtainedDatasetId) {
      console.error(`❌ No RunId or DatasetId received from MCP call for ${mcpToolName}. Cannot poll.`);
      return [];
    }

    // If we have a runId, poll for its completion to get the definitive datasetId
    if (obtainedRunId) {
      console.log(`Polling actor run ${obtainedRunId} for ${mcpToolName}...`);
      const startTime = Date.now();
      while (Date.now() - startTime < MAX_POLLING_DURATION) {
        const runDetailsUrl = `https://api.apify.com/v2/actor-runs/${obtainedRunId}?token=${apifyToken}`;
        console.log(`Fetching run details: ${runDetailsUrl.replace(apifyToken, '<TOKEN>')}`);
        const runResponse = await fetch(runDetailsUrl);
        if (!runResponse.ok) {
          const errorText = await runResponse.text();
          console.error(`❌ Failed to fetch run details for ${obtainedRunId} (status ${runResponse.status}): ${errorText}`);
          throw new Error(`Failed to fetch run details for ${obtainedRunId}`);
        }
        const runData = await runResponse.json();
        console.log(`Run ${obtainedRunId} status: ${runData.data?.status}, DatasetId from run: ${runData.data?.defaultDatasetId}`);

        if (runData.data?.status === 'SUCCEEDED') {
          obtainedDatasetId = runData.data.defaultDatasetId;
          console.log(`✅ Run ${obtainedRunId} SUCCEEDED. Using DatasetID: ${obtainedDatasetId}`);
          break; // Exit polling loop
        } else if (['FAILED', 'TIMED_OUT', 'ABORTED'].includes(runData.data?.status)) {
          console.error(`❌ Run ${obtainedRunId} for ${mcpToolName} did not succeed. Status: ${runData.data?.status}`);
          return []; // Stop if the run failed
        }
        await sleep(POLLING_INTERVAL);
      }

      if (!obtainedDatasetId) {
        console.error(`❌ Polling for run ${obtainedRunId} timed out or run did not provide a datasetId.`);
        return [];
      }
    }

    // If we only had datasetId from the start, or got it from the run, fetch items
    if (obtainedDatasetId) {
      console.log(`Fetching items from Dataset ID: ${obtainedDatasetId} for tool ${mcpToolName}`);
      const datasetUrl = `https://api.apify.com/v2/datasets/${obtainedDatasetId}/items?token=${apifyToken}&format=json&clean=true&limit=100`; // Limit to 100 for now
      console.log(`Fetching dataset items: ${datasetUrl.replace(apifyToken, '<TOKEN>')}`);
      
      const response = await fetch(datasetUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch dataset items for ${obtainedDatasetId}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch dataset items: ${response.status}`);
      }
      const datasetItems = await response.json();
      console.log(`✅ Successfully fetched ${datasetItems ? datasetItems.length : '0 (or non-array)'} items from dataset ${obtainedDatasetId} for ${mcpToolName}.`);
      
      const normalizedProperties = normalizeAndStructureDatasetItems(datasetItems, mcpToolName);
      console.log(`Normalized ${normalizedProperties.length} properties from dataset ${obtainedDatasetId} for ${mcpToolName}.`);
      return normalizedProperties;
    } else {
      console.error(`❌ No datasetId could be determined for ${mcpToolName} after all steps.`);
      return [];
    }

  } catch (error) {
    console.error(`❌ Error in fetchPropertiesViaMCP (polling) for tool ${mcpToolName}:`, error);
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
                JSON.stringify({ toolName, toolInputIsObject: typeof toolInput === 'object', criteria: !!criteria }, null, 2)); // Log criteria presence
    
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
    
    console.log(`✅ MCP-based property search completed via ${toolName}, found ${properties ? properties.length : 'undefined/null'} properties. Sending to client.`);
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