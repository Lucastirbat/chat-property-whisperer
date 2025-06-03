import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot } from "lucide-react";
import { Message } from "@/components/Message";
import { AIService } from "@/services/aiService";
import { ConversationState, SearchCriteria, UnifiedProperty } from "@/types/property";
import { PropertyList } from "./PropertyList";

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      content: "Hello! I'm your AI property assistant powered by Claude. I'll help you find the perfect rental property. Let's start - what city or area are you looking to move to?",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [displayedProperties, setDisplayedProperties] = useState<UnifiedProperty[]>([]);

  const aiService = new AIService('');

  const [conversationState, setConversationState] = useState<ConversationState>({
    stage: 'greeting',
    criteria: {
      location: '',
      isComplete: false
    } as SearchCriteria,
    missingInfo: ['location', 'budget', 'property_type']
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);
    setIsSearching(true);
    setDisplayedProperties([]);

    try {
      const { response, newState, properties: fetchedProperties } = await aiService.generateResponse(
        [...messages, userMessage], 
        conversationState
      );

      setConversationState(newState);

      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botResponse]);

      if (fetchedProperties && fetchedProperties.length > 0) {
        setDisplayedProperties(fetchedProperties);
        console.log(`ChatInterface received ${fetchedProperties.length} properties to display.`);
      } else if (newState.stage === 'presenting') {
        console.log("Search attempted, but no properties returned to ChatInterface.");
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm having trouble processing your request. Please try again.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-2/5 lg:w-1/3 xl:w-1/3 h-full flex flex-col border-r border-gray-200 bg-white min-h-0">
        <div className="bg-blue-600 text-white p-4 shadow-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8" />
            <div>
              <h1 className="text-xl font-bold">Property Whisperer</h1>
              <p className="text-blue-100 text-sm">
                {isSearching ? 'Searching properties...' : 'AI-Powered Property Assistant'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          
          {(isTyping || isSearching) && (
            <div className="flex items-center gap-2 text-gray-500">
              <Bot className="h-5 w-5" />
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-sm">
                {isSearching ? 'Searching properties...' : 'Thinking...'}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Tell me about your property needs..."
              className="flex-1"
              disabled={isSearching}
            />
            <Button 
              onClick={handleSendMessage} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isSearching || !inputValue.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 h-full overflow-y-auto bg-gray-50 min-h-0">
        <PropertyList properties={displayedProperties} isLoading={isSearching && displayedProperties.length === 0} />
      </div>
    </div>
  );
};
