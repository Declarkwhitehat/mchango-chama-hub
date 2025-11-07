import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, Users, PiggyBank, BadgeDollarSign } from "lucide-react";

interface QuickSummaryCardsProps {
  currentSavings: number;
  lifetimeDeposits: number;
  totalGroupSavings: number;
  groupProfitPool: number;
  loanPoolAvailable: number;
}

export default function QuickSummaryCards({
  currentSavings,
  lifetimeDeposits,
  totalGroupSavings,
  groupProfitPool,
  loanPoolAvailable,
}: QuickSummaryCardsProps) {
  const formatCurrency = (amount: number) => {
    return `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const cards = [
    {
      title: "My Current Savings",
      value: formatCurrency(currentSavings),
      icon: Wallet,
      color: "text-blue-600",
    },
    {
      title: "My Lifetime Deposits",
      value: formatCurrency(lifetimeDeposits),
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      title: "Total Group Savings (TGS)",
      value: formatCurrency(totalGroupSavings),
      icon: Users,
      color: "text-purple-600",
    },
    {
      title: "Group Profit Pool (GPP)",
      value: formatCurrency(groupProfitPool),
      icon: PiggyBank,
      color: "text-orange-600",
    },
    {
      title: "Loan Pool Available (30%)",
      value: formatCurrency(loanPoolAvailable),
      icon: BadgeDollarSign,
      color: "text-teal-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
