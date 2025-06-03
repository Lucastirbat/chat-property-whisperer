
import { PropertyCard } from "@/components/PropertyCard";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Property {
  id: string;
  title: string;
  price: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  area: string;
  image: string;
  description: string;
  features: string[];
}

const mockProperties: Property[] = [
  {
    id: '1',
    title: 'Modern Downtown Apartment',
    price: '$2,500/month',
    location: 'Downtown District',
    bedrooms: 2,
    bathrooms: 2,
    area: '950 sq ft',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop',
    description: 'Stunning modern apartment with city views and premium amenities.',
    features: ['Gym', 'Pool', 'Parking', 'Pet Friendly']
  },
  {
    id: '2',
    title: 'Cozy Family House',
    price: '$3,200/month',
    location: 'Suburban Heights',
    bedrooms: 3,
    bathrooms: 2,
    area: '1,200 sq ft',
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop',
    description: 'Beautiful family home with garden and quiet neighborhood.',
    features: ['Garden', 'Garage', 'Near Schools', 'Quiet Area']
  },
  {
    id: '3',
    title: 'Luxury Penthouse',
    price: '$5,500/month',
    location: 'Uptown Elite',
    bedrooms: 3,
    bathrooms: 3,
    area: '1,800 sq ft',
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=300&fit=crop',
    description: 'Exclusive penthouse with panoramic city views and luxury finishes.',
    features: ['City Views', 'Concierge', 'Rooftop', 'High-End']
  },
  {
    id: '4',
    title: 'Studio Loft',
    price: '$1,800/month',
    location: 'Arts District',
    bedrooms: 1,
    bathrooms: 1,
    area: '650 sq ft',
    image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&h=300&fit=crop',
    description: 'Creative studio space perfect for young professionals.',
    features: ['High Ceilings', 'Artistic Area', 'Cafes Nearby', 'Transit']
  }
];

export const PropertyList = () => {
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 border-b border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Found Properties</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input placeholder="Search properties..." className="pl-10" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Properties Count */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
        <p className="text-sm text-blue-700">
          <span className="font-semibold">{mockProperties.length} properties</span> found matching your criteria
        </p>
      </div>

      {/* Property List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mockProperties.map((property, index) => (
          <div key={property.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <PropertyCard property={property} />
          </div>
        ))}
      </div>
    </div>
  );
};
