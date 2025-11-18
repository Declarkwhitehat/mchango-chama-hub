import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface FilterConfig {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string[];
  minAmount?: number;
  maxAmount?: number;
  kycStatus?: string[];
  role?: string[];
  searchField?: string;
}

interface AdvancedFiltersProps {
  onFilterChange: (filters: FilterConfig) => void;
  filterOptions: {
    statuses?: { value: string; label: string }[];
    kycStatuses?: { value: string; label: string }[];
    roles?: { value: string; label: string }[];
    searchFields?: { value: string; label: string }[];
    showAmountRange?: boolean;
    showDateRange?: boolean;
  };
}

export const AdvancedFilters = ({ onFilterChange, filterOptions }: AdvancedFiltersProps) => {
  const [filters, setFilters] = useState<FilterConfig>({});
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof FilterConfig, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  const activeFilterCount = Object.values(filters).filter(v => 
    v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Advanced Filters</h4>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear All
                  </Button>
                )}
              </div>

              {/* Date Range */}
              {filterOptions.showDateRange && (
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left font-normal",
                            !filters.dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateFrom ? format(filters.dateFrom, "PP") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateFrom}
                          onSelect={(date) => updateFilter('dateFrom', date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left font-normal",
                            !filters.dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateTo ? format(filters.dateTo, "PP") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateTo}
                          onSelect={(date) => updateFilter('dateTo', date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {/* Status Filter */}
              {filterOptions.statuses && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={filters.status?.[0] || "all"}
                    onValueChange={(value) => updateFilter('status', value === 'all' ? [] : [value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {filterOptions.statuses.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* KYC Status Filter */}
              {filterOptions.kycStatuses && (
                <div className="space-y-2">
                  <Label>KYC Status</Label>
                  <Select
                    value={filters.kycStatus?.[0] || "all"}
                    onValueChange={(value) => updateFilter('kycStatus', value === 'all' ? [] : [value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All KYC statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All KYC statuses</SelectItem>
                      {filterOptions.kycStatuses.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Role Filter */}
              {filterOptions.roles && (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={filters.role?.[0] || "all"}
                    onValueChange={(value) => updateFilter('role', value === 'all' ? [] : [value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {filterOptions.roles.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Amount Range */}
              {filterOptions.showAmountRange && (
                <div className="space-y-2">
                  <Label>Amount Range (KES)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minAmount || ''}
                      onChange={(e) => updateFilter('minAmount', e.target.value ? Number(e.target.value) : undefined)}
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxAmount || ''}
                      onChange={(e) => updateFilter('maxAmount', e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>
              )}

              {/* Search Field Selector */}
              {filterOptions.searchFields && (
                <div className="space-y-2">
                  <Label>Search In</Label>
                  <Select
                    value={filters.searchField || "all"}
                    onValueChange={(value) => updateFilter('searchField', value === 'all' ? undefined : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All fields" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All fields</SelectItem>
                      {filterOptions.searchFields.map(field => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active Filter Tags */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {filters.dateFrom && (
              <Badge variant="secondary" className="gap-1">
                From: {format(filters.dateFrom, "PP")}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => updateFilter('dateFrom', undefined)}
                />
              </Badge>
            )}
            {filters.dateTo && (
              <Badge variant="secondary" className="gap-1">
                To: {format(filters.dateTo, "PP")}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => updateFilter('dateTo', undefined)}
                />
              </Badge>
            )}
            {filters.status && filters.status.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                Status: {filters.status[0]}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => updateFilter('status', [])}
                />
              </Badge>
            )}
            {(filters.minAmount || filters.maxAmount) && (
              <Badge variant="secondary" className="gap-1">
                Amount: {filters.minAmount || 0} - {filters.maxAmount || '∞'}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    updateFilter('minAmount', undefined);
                    updateFilter('maxAmount', undefined);
                  }}
                />
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
