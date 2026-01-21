import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChatMessage } from './ChatMessage';
import { CallbackForm } from './CallbackForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const LANGUAGE_GREETINGS = {
  english: 'Hello! 👋 I\'m here to help you with any questions about Chama Groups, Mchango Campaigns, and Organizations. How can I assist you today?\n\n💡 Need to speak with someone? Just ask and I can arrange a callback!',
  swahili: 'Habari! 👋 Niko hapa kukusaidia na maswali yoyote kuhusu Vikundi vya Chama, Kampeni za Mchango, na Mashirika. Naweza kukusaidia vipi leo?\n\n💡 Unahitaji kuongea na mtu? Niambie tu na nitaandaa kupigwa simu!',
  sheng: 'Vipi! 👋 Niko hapa ku-help na maswali zote za Chama Groups, Mchango Campaigns, na Organizations. Naweza ku-help aje leo?\n\n💡 Unataka kuongelesha na mse? Niambie tu nita-arrange callback!',
};

export function ChatSupport() {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<'english' | 'swahili' | 'sheng'>(() => {
    const saved = localStorage.getItem('chat-language');
    return (saved as 'english' | 'swahili' | 'sheng') || 'english';
  });
  const [sessionId] = useState<string>(() => {
    const saved = localStorage.getItem('chat-session-id');
    if (saved) return saved;
    const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chat-session-id', newId);
    return newId;
  });
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: LANGUAGE_GREETINGS[language],
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history from database
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const { data: user } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', sessionId)
          .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading chat history:', error);
          return;
        }

        if (data && data.length > 0) {
          const loadedMessages = data.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at)
          }));
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadChatHistory();
  }, [sessionId]);

  // Save message to database
  const saveMessage = async (message: Message) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.user?.id || null,
        role: message.role,
        content: message.content,
        created_at: message.timestamp.toISOString()
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const handleLanguageChange = (newLanguage: 'english' | 'swahili' | 'sheng') => {
    setLanguage(newLanguage);
    localStorage.setItem('chat-language', newLanguage);
    const newGreeting = {
      role: 'assistant' as const,
      content: LANGUAGE_GREETINGS[newLanguage],
      timestamp: new Date()
    };
    setMessages([newGreeting]);
    saveMessage(newGreeting);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    saveMessage(userMessage);
    setCurrentQuestion(inputValue);
    setInputValue('');
    setIsStreaming(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          messages: messages.concat(userMessage).map(m => ({
            role: m.role,
            content: m.content
          })),
          language: language
        })
      });

      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({ error: 'Failed to get response' }));
        if (error.needsCallback) {
          setShowCallbackForm(true);
        }
        throw new Error(error.error || 'Failed to get response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let needsCallback = false;

      // Add empty assistant message to start streaming into
      const assistantMessageTimestamp = new Date();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: assistantMessageTimestamp
      }]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            
            // Check for tool calls (callback request)
            if (parsed.choices?.[0]?.delta?.tool_calls) {
              needsCallback = true;
              break;
            }

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: assistantMessage,
                  timestamp: new Date()
                };
                return newMessages;
              });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }

      if (needsCallback) {
        setShowCallbackForm(true);
        const callbackMessage = {
          role: 'assistant' as const,
          content: 'I apologize, but I need to connect you with our support team for this. Would you like them to call you back? Please share your contact details below.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev.slice(0, -1), callbackMessage]);
        saveMessage(callbackMessage);
      } else if (assistantMessage) {
        // Save the completed assistant message
        saveMessage({
          role: 'assistant',
          content: assistantMessage,
          timestamp: assistantMessageTimestamp
        });
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant' as const,
        content: 'Sorry, I\'m having trouble right now. Would you like our team to call you back?',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      saveMessage(errorMessage);
      setShowCallbackForm(true);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCallbackSuccess = () => {
    setShowCallbackForm(false);
    const successMessage = {
      role: 'assistant' as const,
      content: 'Thank you! Our team will call you within 24 hours. Is there anything else I can help you with?',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, successMessage]);
    saveMessage(successMessage);
  };

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(var(--bottom-nav-offset)+16px)] right-4 h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50 bg-primary hover:bg-primary/90 p-0"
        >
          <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-4 right-4 w-[360px] h-[600px] flex flex-col shadow-2xl z-50 md:w-[400px] md:h-[600px] max-md:w-[calc(100vw-1rem)] max-md:h-[calc(100vh-1rem)] max-md:bottom-0 max-md:right-0 max-md:rounded-none">
          {/* Header */}
          <div className="p-3 border-b bg-primary text-primary-foreground rounded-t-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <h3 className="font-semibold text-sm">AI Assistant</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/25 active:bg-white/30 transition-colors touch-manipulation"
                aria-label="Close chat"
              >
                <span className="text-xs text-primary-foreground/80 font-medium">
                  Close
                </span>
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Language Selector */}
            <div className="flex items-center gap-2">
              <Languages className="h-3 w-3" />
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="h-7 w-[100px] bg-primary-foreground text-primary border-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="swahili">Kiswahili</SelectItem>
                  <SelectItem value="sheng">Sheng</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <div className="flex gap-2">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce delay-100">●</span>
                  <span className="animate-bounce delay-200">●</span>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
              ))
            )}
            {isStreaming && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-2">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce delay-100">●</span>
                    <span className="animate-bounce delay-200">●</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Callback Form or Input */}
          {showCallbackForm ? (
            <CallbackForm 
              question={currentQuestion}
              conversationHistory={messages}
              onSuccess={handleCallbackSuccess}
              onCancel={() => setShowCallbackForm(false)}
            />
          ) : (
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type your message..."
                  disabled={isStreaming}
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                >
                  Send
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
