
import { Bot, User } from "lucide-react";

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface MessageProps {
  message: ChatMessage;
}

export const Message = ({ message }: MessageProps) => {
  const isBot = message.sender === 'bot';
  
  return (
    <div className={`flex gap-3 ${isBot ? 'flex-row' : 'flex-row-reverse'} animate-fade-in`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isBot ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
      }`}>
        {isBot ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
      </div>
      
      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
        isBot 
          ? 'bg-white border border-gray-200 text-gray-800' 
          : 'bg-blue-600 text-white'
      } shadow-sm`}>
        <p className="text-sm">{message.content}</p>
        <p className={`text-xs mt-1 ${
          isBot ? 'text-gray-500' : 'text-blue-100'
        }`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
};
