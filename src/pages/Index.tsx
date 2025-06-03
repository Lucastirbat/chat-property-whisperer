
import { ChatInterface } from "@/components/ChatInterface";
import { PropertyList } from "@/components/PropertyList";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">
      {/* Chat Interface - Left Side */}
      <div className="w-1/2 border-r border-gray-200 bg-white shadow-lg">
        <ChatInterface />
      </div>
      
      {/* Property List - Right Side */}
      <div className="w-1/2 bg-gray-50">
        <PropertyList />
      </div>
    </div>
  );
};

export default Index;
