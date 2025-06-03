
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Square, MapPin, Heart } from "lucide-react";

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

interface PropertyCardProps {
  property: Property;
}

export const PropertyCard = ({ property }: PropertyCardProps) => {
  return (
    <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-white border border-gray-200">
      <div className="relative">
        <img
          src={property.image}
          alt={property.title}
          className="w-full h-48 object-cover rounded-t-lg"
        />
        <Button
          variant="outline"
          size="sm"
          className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm hover:bg-white"
        >
          <Heart className="h-4 w-4" />
        </Button>
      </div>
      
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
            {property.title}
          </h3>
          <span className="text-xl font-bold text-blue-600">
            {property.price}
          </span>
        </div>
        
        <div className="flex items-center gap-1 text-gray-600 mb-3">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{property.location}</span>
        </div>
        
        <div className="flex items-center gap-4 mb-3 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Bed className="h-4 w-4" />
            <span>{property.bedrooms} bed</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            <span>{property.bathrooms} bath</span>
          </div>
          <div className="flex items-center gap-1">
            <Square className="h-4 w-4" />
            <span>{property.area}</span>
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {property.description}
        </p>
        
        <div className="flex flex-wrap gap-1 mb-3">
          {property.features.map((feature, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {feature}
            </Badge>
          ))}
        </div>
      </CardContent>
      
      <CardFooter className="p-4 pt-0">
        <div className="flex gap-2 w-full">
          <Button variant="outline" className="flex-1">
            View Details
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700">
            Contact
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
