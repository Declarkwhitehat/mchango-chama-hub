import React from "react";

// Matches URLs (http/https) and bare www. links
const URL_REGEX = /(\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+)/gi;

/**
 * Convert plain text containing URLs into React nodes where URLs are rendered
 * as clickable anchor tags. Preserves surrounding whitespace and newlines
 * (use whitespace-pre-wrap on the parent for line breaks).
 */
export function renderTextWithLinks(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_REGEX.source, "gi");

  while ((match = regex.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    // Trim trailing punctuation that's likely not part of the URL
    let cleanUrl = url;
    let trailing = "";
    const trailingMatch = cleanUrl.match(/[.,!?;:)\]]+$/);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      cleanUrl = cleanUrl.slice(0, -trailing.length);
    }
    const href = cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`;
    parts.push(
      <a
        key={`${start}-${cleanUrl}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
      >
        {cleanUrl}
      </a>
    );
    if (trailing) parts.push(trailing);
    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
