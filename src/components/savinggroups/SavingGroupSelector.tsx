import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SavingGroup {
  id: string;
  name: string;
}

interface SavingGroupSelectorProps {
  groups: SavingGroup[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
}

export default function SavingGroupSelector({
  groups,
  selectedGroupId,
  onSelectGroup,
}: SavingGroupSelectorProps) {
  if (groups.length <= 1) {
    return null;
  }

  return (
    <div className="w-full md:w-auto">
      <Select value={selectedGroupId} onValueChange={onSelectGroup}>
        <SelectTrigger className="w-full md:w-[280px]">
          <SelectValue placeholder="Select a saving group" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
