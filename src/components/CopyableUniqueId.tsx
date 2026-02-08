import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyableUniqueIdProps {
  uniqueId: string;
  className?: string;
}

export const CopyableUniqueId = ({ uniqueId, className = "" }: CopyableUniqueIdProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(uniqueId);
      setCopied(true);
      toast.success("Unique ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className={`p-3 bg-muted/50 rounded-lg border ${className}`}>
      <p className="text-xs text-muted-foreground mb-1">Unique ID (for offline payments)</p>
      <div 
        className="flex items-center gap-2 cursor-pointer group"
        onClick={handleCopy}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCopy()}
      >
        <p className="text-lg font-mono font-semibold text-foreground group-hover:text-primary transition-colors">
          {uniqueId}
        </p>
        {copied ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </div>
    </div>
  );
};
