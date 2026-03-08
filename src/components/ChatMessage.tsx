import { cn } from '@/lib/utils';
import { User, FileDown } from 'lucide-react';
import chatBotAvatar from '@/assets/chat-bot-avatar.png';
import { Button } from './ui/button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  // Extract PDF/report URL from message content
  const extractReportUrl = (content: string): string | null => {
    const urlRegex = /(https?:\/\/[^\s]+chama-reports[^\s]+\.(txt|pdf))/i;
    const match = content.match(urlRegex);
    return match ? match[1] : null;
  };

  const reportUrl = extractReportUrl(message.content);

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center overflow-hidden',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      )}>
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <img 
            src={declarkAvatar} 
            alt="Declark Chacha" 
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className={cn(
        'flex flex-col gap-1 max-w-[75%]',
        isUser && 'items-end'
      )}>
        <div className={cn(
          'rounded-lg px-4 py-2',
          isUser 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted text-foreground'
        )}>
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          
          {/* PDF Download Button */}
          {reportUrl && !isUser && (
            <Button
              asChild
              size="sm"
              className="mt-3 w-full"
              variant="default"
            >
              <a 
                href={reportUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Download Report
              </a>
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
