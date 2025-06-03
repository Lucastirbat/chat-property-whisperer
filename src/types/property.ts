// Unified property interface that all scraped data will be normalized to
export interface UnifiedProperty {
  id: string;
  source: 'redfin' | 'zillow' | 'craigslist' | 'apartments' | string;
  title: string;
  price: string;
  priceNumeric: number; // For filtering/sorting
  location: string;
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  bedrooms: number;
  bathrooms: number;
  area: string;
  areaNumeric: number; // Square footage as number
  images: string[];
  description: string;
  features: string[];
  amenities: string[];
  contactInfo?: {
    phone?: string;
    email?: string;
    agentName?: string;
  };
  url: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  availability?: string;
  petPolicy?: string;
  scrapedAt: Date;
}

// User search criteria collected from conversation
export interface SearchCriteria {
  location: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: 'apartment' | 'house' | 'condo' | 'studio' | 'any';
  amenities?: string[];
  petFriendly?: boolean;
  maxCommute?: number; // minutes
  commuteLocation?: string;
  moveInDate?: string;
  leaseDuration?: string;
  isComplete: boolean; // Whether AI has enough info to search
}

// Conversation state management
export interface ConversationState {
  stage: 'greeting' | 'gathering' | 'confirming' | 'searching' | 'presenting';
  criteria: SearchCriteria;
  missingInfo: string[];
  lastQuestion?: string;
}

// Apify actor responses (we'll need to adapt based on actual responses)
export interface RedfinProperty {
  url: string;
  title: string;
  price: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  sqft: string;
  description: string;
  images: string[];
  features: string[];
  // Add more based on actual Redfin scraper output
}

export interface ZillowProperty {
  // Define based on Zillow scraper output
  [key: string]: any;
}

export interface CraigslistProperty {
  // Define based on Craigslist scraper output
  [key: string]: any;
} 