import { UnifiedProperty, SearchCriteria } from '@/types/property';

export class ApifyService {
  private baseUrl: string;

  constructor(apiToken: string) {
    // We don't need the token on frontend anymore
    this.baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  }

  async searchProperties(criteria: SearchCriteria): Promise<UnifiedProperty[]> {
    console.log('Starting property search with criteria:', criteria);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/properties/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ criteria })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Property search failed');
      }

      const data = await response.json();
      console.log(`Received ${data.properties.length} properties from backend`);
      
      return this.rankProperties(data.properties, criteria);
      
    } catch (error) {
      console.error('Property search failed:', error);
      throw new Error('Failed to search properties');
    }
  }

  private rankProperties(properties: UnifiedProperty[], criteria: SearchCriteria): UnifiedProperty[] {
    return properties.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Prefer properties within budget
      if (criteria.maxPrice) {
        if (a.priceNumeric <= criteria.maxPrice) scoreA += 10;
        if (b.priceNumeric <= criteria.maxPrice) scoreB += 10;
      }

      // Prefer exact bedroom match
      if (criteria.bedrooms) {
        if (a.bedrooms === criteria.bedrooms) scoreA += 5;
        if (b.bedrooms === criteria.bedrooms) scoreB += 5;
      }

      // Prefer properties with images
      if (a.images.length > 0) scoreA += 2;
      if (b.images.length > 0) scoreB += 2;

      return scoreB - scoreA;
    });
  }
} 