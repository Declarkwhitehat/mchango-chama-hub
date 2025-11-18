import { cn } from '@/lib/utils';
import { MessageCircle, User } from 'lucide-react';

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

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      )}>
        {isUser ? <User className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
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
        </div>
        <span className="text-xs text-muted-foreground px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
