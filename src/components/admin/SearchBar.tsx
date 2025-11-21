import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SearchBarProps {
  onSearch: (query: string, type: string) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const SearchBar = ({ onSearch, onClear, isLoading }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("all");

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), searchType);
    }
  };

  const handleClear = () => {
    setQuery("");
    onClear();
  };

  return (
    <form onSubmit={handleSearch} className="flex gap-2">
      <Select value={searchType} onValueChange={setSearchType}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Search by..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="user">User Name</SelectItem>
          <SelectItem value="member_code">Member Code</SelectItem>
          <SelectItem value="id_number">ID Number</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="phone">Phone</SelectItem>
          <SelectItem value="mchango_slug">Mchango Slug</SelectItem>
          <SelectItem value="transaction_id">Transaction ID</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex-1 relative">
        <Input
          type="text"
          placeholder={
            searchType === 'member_code' ? 'e.g., FDE1, ABC2' :
            searchType === 'phone' ? 'e.g., 0712345678 or +254712345678' :
            searchType === 'email' ? 'e.g., user@example.com' :
            searchType === 'id_number' ? 'e.g., 12345678' :
            searchType === 'user' ? 'e.g., John Doe' :
            'Search anything...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-20"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-12 top-1/2 -translate-y-1/2 h-7"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Button type="submit" disabled={!query.trim() || isLoading}>
        <Search className="h-4 w-4 mr-2" />
        {isLoading ? "Searching..." : "Search"}
      </Button>
    </form>
  );
};
