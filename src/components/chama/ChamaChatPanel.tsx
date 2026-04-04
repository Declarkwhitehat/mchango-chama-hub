import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Megaphone, Loader2 } from "lucide-react";

interface ChatMessage {
  id: string;
  chama_id: string;
  user_id: string;
  message: string;
  is_announcement: boolean;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
}

interface ChamaChatPanelProps {
  chamaId: string;
  isManager: boolean;
}

export const ChamaChatPanel = ({ chamaId, isManager }: ChamaChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCurrentUser();
    loadMessages();

    const channel = supabase
      .channel(`chama-chat-${chamaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chama_messages',
          filter: `chama_id=eq.${chamaId}`
        },
        async (payload) => {
          // Fetch the new message with profile info
          const { data } = await supabase
            .from('chama_messages' as any)
            .select('*, profiles:user_id(full_name)')
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            setMessages(prev => [...prev, data as any]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chamaId]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('chama_messages' as any)
        .select('*, profiles:user_id(full_name)')
        .eq('chama_id', chamaId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages((data as any[]) || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from('chama_messages' as any)
        .insert({
          chama_id: chamaId,
          user_id: currentUserId,
          message: newMessage.trim(),
          is_announcement: isAnnouncement && isManager
        } as any);

      if (error) throw error;
      setNewMessage("");
      setIsAnnouncement(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
      ` ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Group Chat</CardTitle>
          <span className="text-[10px] text-muted-foreground">Messages auto-delete after 7 days</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0 px-6 pb-4">
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No messages yet. Start the conversation!
            </p>
          ) : (
            <div className="space-y-3 py-2">
              {messages.map((msg) => {
                const isOwn = msg.user_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                  >
                    {!isOwn && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs">
                          {(msg.profiles?.full_name || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && (
                        <p className="text-xs text-muted-foreground mb-0.5 px-1">
                          {msg.profiles?.full_name || 'Unknown'}
                        </p>
                      )}
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm ${
                          msg.is_announcement
                            ? 'bg-primary/10 border border-primary/20'
                            : isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                        }`}
                      >
                        {msg.is_announcement && (
                          <div className="flex items-center gap-1 mb-1">
                            <Megaphone className="h-3 w-3 text-primary" />
                            <span className="text-xs font-semibold text-primary">Announcement</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                      <p className={`text-[10px] text-muted-foreground mt-0.5 px-1 ${isOwn ? 'text-right' : ''}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center gap-2 pt-3 border-t border-border mt-2">
          {isManager && (
            <Button
              variant={isAnnouncement ? "default" : "ghost"}
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={() => setIsAnnouncement(!isAnnouncement)}
              title="Toggle announcement"
            >
              <Megaphone className="h-4 w-4" />
            </Button>
          )}
          <Input
            placeholder={isAnnouncement ? "Type an announcement..." : "Type a message..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            className="flex-1"
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={sendMessage}
            disabled={isSending || !newMessage.trim()}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
