import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, ExternalLink, Loader2, Check, Pencil } from "lucide-react";

interface WhatsAppLinkManagerProps {
  chamaId: string;
  currentLink?: string | null;
  isManager: boolean;
  onUpdate?: () => void;
}

export const WhatsAppLinkManager = ({ 
  chamaId, 
  currentLink, 
  isManager,
  onUpdate 
}: WhatsAppLinkManagerProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [link, setLink] = useState(currentLink || "");
  const [isSaving, setIsSaving] = useState(false);

  const validateWhatsAppLink = (url: string): boolean => {
    if (!url) return true; // Empty is valid (allows clearing)
    const pattern = /^https:\/\/(chat\.whatsapp\.com|wa\.me)\/.+/i;
    return pattern.test(url);
  };

  const handleSave = async () => {
    const trimmedLink = link.trim();
    
    if (trimmedLink && !validateWhatsAppLink(trimmedLink)) {
      toast({
        title: "Invalid Link",
        description: "Please enter a valid WhatsApp group link (https://chat.whatsapp.com/...)",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('chama')
        .update({ whatsapp_link: trimmedLink || null })
        .eq('id', chamaId);

      if (error) throw error;

      toast({
        title: trimmedLink ? "Link Updated" : "Link Removed",
        description: trimmedLink 
          ? "WhatsApp group link has been saved" 
          : "WhatsApp group link has been removed",
      });
      
      setIsEditing(false);
      onUpdate?.();
    } catch (error: any) {
      console.error("Error updating WhatsApp link:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Could not update the WhatsApp link",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLink(currentLink || "");
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5 text-green-600" />
          WhatsApp Group
        </CardTitle>
        <CardDescription>
          {isManager 
            ? "Share your chama's WhatsApp group link with members"
            : "Join the chama's WhatsApp group for updates"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-link">WhatsApp Group Link</Label>
              <Input
                id="whatsapp-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Paste your WhatsApp group invite link here
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                size="sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCancel}
                size="sm"
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {currentLink ? (
              <div className="flex items-center gap-3">
                <a
                  href={currentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-medium">Join WhatsApp Group</span>
                  <ExternalLink className="h-4 w-4 ml-auto" />
                </a>
              </div>
            ) : (
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  {isManager 
                    ? "No WhatsApp group link set yet"
                    : "No WhatsApp group link available"
                  }
                </p>
              </div>
            )}
            
            {isManager && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsEditing(true)}
                className="w-full"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {currentLink ? "Edit Link" : "Add WhatsApp Link"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
