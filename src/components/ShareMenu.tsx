import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, MessageCircle, Facebook, Mail, MessageSquare, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface ShareMenuProps {
  url: string;
  title?: string;
  text?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

export const ShareMenu = ({
  url,
  title = "Check this out!",
  text = "",
  variant = "outline",
  size = "sm",
  label = "Share",
  className = "",
}: ShareMenuProps) => {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text || title);
  const fullMessage = encodeURIComponent(`${text || title}\n${url}`);

  const shareOptions = [
    {
      label: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${fullMessage}`,
      color: "text-green-600",
    },
    {
      label: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      color: "text-blue-600",
    },
    {
      label: "Email",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${fullMessage}`,
      color: "text-orange-600",
    },
    {
      label: "SMS / Message",
      icon: MessageSquare,
      href: `sms:?body=${fullMessage}`,
      color: "text-purple-600",
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={`gap-2 ${className}`}>
          <Share2 className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {shareOptions.map((option) => (
          <DropdownMenuItem key={option.label} asChild>
            <a
              href={option.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 cursor-pointer"
            >
              <option.icon className={`h-4 w-4 ${option.color}`} />
              <span>{option.label}</span>
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={handleCopyLink} className="flex items-center gap-3 cursor-pointer">
          {copied ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
          <span>{copied ? "Copied!" : "Copy Link"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
