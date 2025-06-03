import { ChatInterface } from "@/components/ChatInterface";
// PropertyList is now rendered *inside* ChatInterface, so we don't import or render it here directly.

const Index = () => {
  return (
    // This div should ensure ChatInterface can take full height.
    // ChatInterface itself will handle the two-column layout (chat panel + property list panel).
    <div className="h-screen w-screen overflow-hidden"> 
      <ChatInterface />
    </div>
  );
};

export default Index;
