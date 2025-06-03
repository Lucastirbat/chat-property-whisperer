import React from 'react';
import { PropertyCard } from './PropertyCard';
import { UnifiedProperty } from '@/types/property'; // Import UnifiedProperty
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Remove the mock Property interface if UnifiedProperty covers everything
// interface Property { ... } 

// Mock data - replace with actual data passed as props
// const mockProperties: UnifiedProperty[] = [ ... ]; // Remove or comment out

interface PropertyListProps {
  properties: UnifiedProperty[];
  isLoading: boolean; // Add isLoading prop
}

export const PropertyList = ({ properties, isLoading }: PropertyListProps) => {
  return (
    // This main div should take the full height given by its parent in ChatInterface
    <div className="h-full flex flex-col">
      {/* Header (Property Listings title, Search, Filter) - Sticky */}
      <div className="bg-white p-4 border-b border-gray-200 shadow-sm sticky top-0 z-10 flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Property Listings</h2> {/* Moved title here */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input placeholder="Search properties..." className="pl-10" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-1" /> Filter
          </Button>
        </div>
      </div>

      {/* Properties Count / Loading / Empty State - Sticky or part of scrollable area */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0"> {/* Consider if this should scroll or be sticky */}
        {isLoading && <p className="text-sm text-gray-600">Searching for properties...</p>}
        {!isLoading && properties.length > 0 && (
          <p className="text-sm text-blue-700">
            <span className="font-semibold">{properties.length} properties</span> found matching your criteria
          </p>
        )}
        {!isLoading && properties.length === 0 && (
          <p className="text-sm text-gray-500">No properties to display. Chat with the AI to find some!</p>
        )}
      </div>

      {/* Scrollable Property Grid */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0"> {/* Added min-h-0 */}
        {properties.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6"> {/* Adjusted lg to 2, xl to 3 */}
            {properties.map((property) => (
              <PropertyCard key={property.id || property.url} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
