import { Button } from "@/components/ui/button";
import { FeatureCard } from "@/components/FeatureCard";
import { Header } from "@/components/Header";
import Footer from "@/components/Footer";
import { Users, TrendingUp, Heart, Shield, Building2, ChevronDown, User, Home, ShieldCheck, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
// heroImage is available for future use
import heroImage from "@/assets/hero-image.jpg";


const Index = () => {
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);

  useEffect(() => {
    // Check if running as installed PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsPWAInstalled(isStandalone);

    // Listen for display mode changes
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleChange = () => setIsPWAInstalled(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const { user } = useAuth();
  const location = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/mchango", icon: Heart, label: "Campaigns" },
    { href: "/chama", icon: Users, label: "Chamas" },
    { href: "/welfare", icon: ShieldCheck, label: "Welfare" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  const isActiveRoute = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pb-[calc(var(--bottom-nav-offset)+24px)]">
      {/* Header */}
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 md:pt-24 lg:pt-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-background z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent z-0" />
        <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 md:py-28 lg:py-36 relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* Content */}
            <div className="space-y-6 sm:space-y-8 text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
                The All-in-One Digital Hub for{" "}
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Chamas and Mchango Campaigns
                </span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto px-4">
                Join thousands building wealth through secure online Chama groups and Mchango campaigns in Kenya
              </p>
              <p className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-wider text-center px-4 mt-3">
                <span style={{ color: "hsl(142, 76%, 46%)" }}>s</span>
                <span style={{ color: "hsl(48, 96%, 53%)" }}>i</span>
                <span style={{ color: "hsl(199, 89%, 48%)" }}>s</span>
                <span style={{ color: "hsl(340, 82%, 52%)" }}>i</span>
                {" "}
                <span style={{ color: "hsl(262, 83%, 58%)" }}>t</span>
                <span style={{ color: "hsl(25, 95%, 53%)" }}>u</span>
                <span style={{ color: "hsl(172, 66%, 50%)" }}>k</span>
                <span style={{ color: "hsl(0, 84%, 60%)" }}>o</span>
                {" "}
                <span style={{ color: "hsl(142, 76%, 46%)" }}>p</span>
                <span style={{ color: "hsl(48, 96%, 53%)" }}>a</span>
                <span style={{ color: "hsl(199, 89%, 48%)" }}>m</span>
                <span style={{ color: "hsl(340, 82%, 52%)" }}>o</span>
                <span style={{ color: "hsl(262, 83%, 58%)" }}>j</span>
                <span style={{ color: "hsl(25, 95%, 53%)" }}>a</span>
                {" "}
                <span style={{ color: "hsl(172, 66%, 50%)" }}>j</span>
                <span style={{ color: "hsl(0, 84%, 60%)" }}>e</span>
                {" "}
                <span style={{ color: "hsl(142, 76%, 46%)" }}>w</span>
                <span style={{ color: "hsl(48, 96%, 53%)" }}>e</span>
                <span style={{ color: "hsl(199, 89%, 48%)" }}>w</span>
                <span style={{ color: "hsl(340, 82%, 52%)" }}>e</span>
                <span style={{ color: "hsl(262, 83%, 58%)" }}>?</span>
              </p>
              
              {/* CTA Buttons */}
              <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:gap-4 justify-center items-center pt-4 sm:pt-6 max-w-4xl mx-auto">
                <Button 
                  variant="hero" 
                  size="xl"
                  className="w-full sm:w-auto sm:min-w-[180px]"
                  onClick={() => window.location.href = '/mchango'}
                >
                  <Heart className="mr-2 h-5 w-5" />
                  Campaigns
                </Button>
                <Button 
                  variant="heroSecondary" 
                  size="xl"
                  className="w-full sm:w-auto sm:min-w-[180px]"
                  onClick={() => window.location.href = '/chama'}
                >
                  <Users className="mr-2 h-5 w-5" />
                  Chamas
                </Button>
                <Button 
                  variant="heroSecondary" 
                  size="xl"
                  className="w-full sm:w-auto sm:min-w-[180px]"
                  onClick={() => window.location.href = '/welfare'}
                >
                  <ShieldCheck className="mr-2 h-5 w-5" />
                  Welfare
                </Button>
                <Button 
                  variant="heroSecondary" 
                  size="xl"
                  className="w-full sm:w-auto sm:min-w-[180px]"
                  onClick={() => window.location.href = '/organizations'}
                >
                  <Building2 className="mr-2 h-5 w-5" />
                  Organizations
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
            Start a Transparent Mchango Campaign Today
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto px-4">
            Empowering communities with secure, transparent financial tools
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <FeatureCard
            icon={<Users className="h-8 w-8 text-primary" />}
            title="Chama Groups"
            description="Create or join saving circles with trusted members. Track contributions and grow together."
          />
          <FeatureCard
            icon={<TrendingUp className="h-8 w-8 text-secondary" />}
            title="Mchango Campaigns"
            description="Launch fundraising campaigns for any cause. Reach your goals with community support."
          />
          <FeatureCard
            icon={<Shield className="h-8 w-8 text-primary" />}
            title="Secure & Safe"
            description="Bank-level security ensures your money and data are always protected."
          />
          <FeatureCard
            icon={<Heart className="h-8 w-8 text-secondary" />}
            title="Community First"
            description="Built for Africans, by Africans. Supporting dreams and goals across the continent."
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-card py-12 sm:py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-card-foreground mb-3 sm:mb-4">
              Manage Your Online Chama with Ease
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 md:gap-12 max-w-7xl mx-auto">
            {/* Mchango */}
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-secondary to-secondary-glow rounded-full">
                <span className="text-secondary-foreground font-semibold text-sm sm:text-base">Mchango</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-card-foreground">Start a Fundraiser</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold text-sm sm:text-base">1</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Create Campaign</h4>
                    <p className="text-muted-foreground text-sm">Set your goal and share your story</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold text-sm sm:text-base">2</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Share & Promote</h4>
                    <p className="text-muted-foreground text-sm">Reach supporters across platforms</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold text-sm sm:text-base">3</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Receive Funds</h4>
                    <p className="text-muted-foreground text-sm">Get contributions directly to your account</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Chama */}
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-primary to-primary-glow rounded-full">
                <span className="text-primary-foreground font-semibold text-sm sm:text-base">Chama</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-card-foreground">Rotating Savings</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold text-sm sm:text-base">1</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Create or Join</h4>
                    <p className="text-muted-foreground text-sm">Start a group or join existing chamas</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold text-sm sm:text-base">2</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Contribute Regularly</h4>
                    <p className="text-muted-foreground text-sm">Make scheduled contributions together</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold text-sm sm:text-base">3</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Receive Payout</h4>
                    <p className="text-muted-foreground text-sm">Each cycle, one member receives the pot</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Digital Tools for Welfare & Organizations */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-4">
              <h2 className="text-xl sm:text-2xl font-bold text-card-foreground mb-2 text-center">Digital Tools for Welfare Organizations</h2>
            </div>
            {/* Welfare */}
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-destructive/80 to-destructive/60 rounded-full">
                <span className="text-destructive-foreground font-semibold text-sm sm:text-base">Welfare</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-card-foreground">Welfare Groups</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-destructive/20 rounded-full flex items-center justify-center text-destructive font-semibold text-sm sm:text-base">1</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Create or Join</h4>
                    <p className="text-muted-foreground text-sm">Start a welfare group or join with a code</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-destructive/20 rounded-full flex items-center justify-center text-destructive font-semibold text-sm sm:text-base">2</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Pool Contributions</h4>
                    <p className="text-muted-foreground text-sm">Members contribute to a shared welfare fund</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-destructive/20 rounded-full flex items-center justify-center text-destructive font-semibold text-sm sm:text-base">3</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Request Withdrawal</h4>
                    <p className="text-muted-foreground text-sm">Access funds when you need support most</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Organizations */}
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-accent to-accent/80 rounded-full">
                <span className="text-accent-foreground font-semibold text-sm sm:text-base">Organizations</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-card-foreground">Support Causes</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-accent/20 rounded-full flex items-center justify-center text-accent font-semibold text-sm sm:text-base">1</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Register Organization</h4>
                    <p className="text-muted-foreground text-sm">Create a verified organization profile</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-accent/20 rounded-full flex items-center justify-center text-accent font-semibold text-sm sm:text-base">2</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Receive Donations</h4>
                    <p className="text-muted-foreground text-sm">Accept contributions from supporters</p>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-accent/20 rounded-full flex items-center justify-center text-accent font-semibold text-sm sm:text-base">3</div>
                  <div>
                    <h4 className="font-semibold text-card-foreground text-sm sm:text-base">Make Impact</h4>
                    <p className="text-muted-foreground text-sm">Use funds to drive your mission forward</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Download App Section - Compact - Only show if not installed */}
      {!isPWAInstalled && (
        <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="bg-gradient-to-br from-accent/5 to-primary/5 rounded-xl p-6 sm:p-8 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <img
                src="/pwa-192x192.png"
                alt="Pamoja App"
                className="w-14 h-14 rounded-xl flex-shrink-0"
              />
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg sm:text-xl font-bold text-foreground mb-1">
                  Download Pamoja App
                </h3>
                <p className="text-sm text-muted-foreground">
                  Get fingerprint login, offline access, faster loading &amp; instant notifications
                </p>
              </div>
              <Button 
                variant="default"
                size="lg"
                className="whitespace-nowrap gap-1.5"
                onClick={() => {
                  window.open("https://github.com/Declarkwhitehat/mchango-chama-hub/releases/latest/download/app-debug.apk", "_blank");
                }}
              >
                <Smartphone className="h-4 w-4" />
                Download APK
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* FAQ Section - Collapsible */}
      <section className="container mx-auto px-4 sm:px-6 py-6">
        <Collapsible open={isFaqOpen} onOpenChange={setIsFaqOpen} className="max-w-3xl mx-auto">
          <div className="flex justify-center">
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                size="lg"
                className="gap-2 hover:bg-accent/50 transition-all"
              >
                <h2 className="text-lg sm:text-xl font-bold text-foreground mb-2">Frequently Asked Questions</h2>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isFaqOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent className="pt-6">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground">
                Quick answers about our platform
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full space-y-2">
              <AccordionItem value="item-1" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  What is the best platform for Mchango campaigns?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  Pamojanova is the leading digital platform in Kenya for secure, transparent, and mobile-money integrated Mchango campaigns. Create your campaign, share it with supporters, and receive contributions directly via M-Pesa.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  Can organizations manage welfare groups digitally?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  Yes, our platform provides specialized tools for organizations to track contributions and ensure accountability. Welfare groups, NGOs, churches, and schools can all manage their funds transparently.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  What is the best online Chama platform in Kenya?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  Pamojanova offers the most trusted digital chama management system with automated rotating savings, M-Pesa integration, and transparent contribution tracking for groups across Kenya.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  How do payments work?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  We accept M-Pesa, Airtel Money, and bank account payments. After KYC verification, you'll set up payment methods with daily limits.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  What is KYC verification?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  KYC is our identity verification process. Upload your ID photos which our team reviews to approve access to all platform features.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  How are withdrawals processed?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  Withdrawals are sent to your default payment method after admin approval. A small commission is deducted to cover platform costs.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" className="border rounded-lg px-4 py-1 bg-card">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-3">
                  Is my money safe on Pamojanova?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  Yes! We use bank-grade security, encrypted connections, and secure payment gateways. All transactions are tracked and auditable for complete transparency.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-6 sm:py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 text-center md:text-left">
            <p className="text-muted-foreground text-sm sm:text-base">
              &copy; 2025 Pamojanova. Building financial futures together.
            </p>
          </div>
        </div>
      </footer>
      <Footer />

      {/* Bottom Navigation */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
          <div className="container flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
            {navItems.map((item) => {
              const isActive = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                  <span className={cn("text-[10px]", isActive ? "font-medium" : "font-normal")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};

export default Index;
