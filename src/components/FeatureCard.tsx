import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <Card className="p-4 sm:p-6 hover:shadow-lg transition-all duration-300 border-border bg-card">
      <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
        <div className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full">
          {icon}
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-card-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm sm:text-base">{description}</p>
      </div>
    </Card>
  );
};
