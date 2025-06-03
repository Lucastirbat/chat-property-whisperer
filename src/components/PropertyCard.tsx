import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Bed, Bath, Square, MapPin, Heart, BedDouble, Ruler } from "lucide-react";
import { UnifiedProperty } from '@/types/property';

interface PropertyCardProps {
  property: UnifiedProperty;
}

export const PropertyCard = ({ property }: PropertyCardProps) => {
  const {
    title,
    price,
    location,
    bedrooms,
    bathrooms,
    area,
    images,
    description,
    url,
    source
  } = property;

  // More detailed logging for the images prop
  if (!images) {
    console.log(`PropertyCard: Images prop for "${title}" is null or undefined.`);
  } else if (!Array.isArray(images)) {
    console.log(`PropertyCard: Images prop for "${title}" is not an array. Value:`, images);
  } else if (images.length === 0) {
    console.log(`PropertyCard: Images prop for "${title}" is an empty array.`);
  }

  const validImages = Array.isArray(images) ? images.filter(img => typeof img === 'string' && img.startsWith('http')) : [];
  
  if (Array.isArray(images) && images.length > 0 && validImages.length === 0) {
    console.log(`PropertyCard: Images prop for "${title}" had items, but none were valid HTTP(S) URLs. Original images:`, images);
  }
  // Optional: Log if valid images are found, for confirmation
  // else if (validImages.length > 0) {
  //   console.log(`PropertyCard: Found ${validImages.length} valid images for "${title}". First one: ${validImages[0]}`);
  // }

  const displayImage = validImages.length > 0 ? validImages[0] : '/placeholder.svg';

  const formatPrice = (p: string | number) => {
    const numericPrice = typeof p === 'string' ? parseFloat(p.replace(/[^0-9.]/g, '')) : p;
    if (isNaN(numericPrice)) return p;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(numericPrice);
  };

  const getDisplaySource = (sourceString: string): string => {
    if (sourceString && sourceString.toLowerCase().includes('zillow')) {
      return 'Zillow';
    }
    if (sourceString && sourceString.toLowerCase().includes('redfin')) {
      return 'Redfin';
    }
    if (sourceString && sourceString.toLowerCase().includes('craigslist')) {
      return 'Craigslist';
    }
    // Fallback to a capitalized version of the original source if no specific mapping
    return sourceString ? sourceString.charAt(0).toUpperCase() + sourceString.slice(1) : 'Unknown Source';
  };

  const displaySource = getDisplaySource(source);

  return (
    <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="p-0 relative">
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`View details for ${title}`}>
          <img 
            src={displayImage} 
            alt={title || 'Property image'} 
            className="w-full h-48 object-cover rounded-t-lg bg-gray-200"
            onError={(e) => { 
              // This error handler will catch issues if the displayImage URL itself is problematic (e.g., 404, CORS on image)
              console.warn(`Failed to load image URL: "${displayImage}" for property: "${title}". Original 'images' prop was:`, images);
              (e.target as HTMLImageElement).src = '/placeholder.svg'; 
              (e.target as HTMLImageElement).alt = 'Image not available';
            }}
          />
        </a>
        <Badge 
          variant="secondary" 
          className="absolute top-2 right-2 bg-opacity-80 backdrop-blur-sm"
        >
          {displaySource}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          <CardTitle className="text-lg font-semibold mb-1 text-blue-700 truncate" title={title}>
            {title || 'Untitled Property'}
          </CardTitle>
        </a>
        <CardDescription className="text-sm text-gray-600 mb-2 truncate" title={location}>
          {location || 'Location not specified'}
        </CardDescription>
        <p className="text-xl font-bold text-gray-800 mb-3">{formatPrice(price)}</p>
        
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-700 mb-3">
          {bedrooms > 0 && (
            <span className="flex items-center"><BedDouble className="h-4 w-4 mr-1 text-blue-500" /> {bedrooms} Bed{bedrooms > 1 ? 's' : ''}</span>
          )}
          {bathrooms > 0 && (
            <span className="flex items-center"><Bath className="h-4 w-4 mr-1 text-blue-500" /> {bathrooms} Bath{bathrooms > 1 ? 's' : ''}</span>
          )}
          {(area && area !== 'N/A') && (
            <span className="flex items-center"><Ruler className="h-4 w-4 mr-1 text-blue-500" /> {area}</span>
          )}
        </div>

        {description && (
          <p className="text-xs text-gray-500 line-clamp-2">
            {description}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-4 border-t">
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="w-full bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 transition-colors"
        >
          View Details
          <ExternalLink className="h-4 w-4 ml-2" />
        </a>
      </CardFooter>
    </Card>
  );
};
