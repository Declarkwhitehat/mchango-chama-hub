import { Button } from "@/components/ui/button";
import { FeatureCard } from "@/components/FeatureCard";
import { Header } from "@/components/Header";
import { Users, TrendingUp, Heart, Shield } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";
import profilePhoto from "@/assets/profile-photo.png";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-[var(--gradient-hero)] z-0" />
        <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Content */}
            <div className="space-y-6 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Build Your Financial Future{" "}
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Together
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
                Join thousands building wealth through community savings groups and crowdfunding campaigns
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
                <Button 
                  variant="hero" 
                  size="xl"
                  className="w-full sm:w-auto"
                  onClick={() => window.location.href = '/mchango'}
                >
                  <Heart className="mr-2 h-5 w-5" />
                  Browse Campaigns
                </Button>
                <Button 
                  variant="heroSecondary" 
                  size="xl"
                  className="w-full sm:w-auto"
                  onClick={() => window.location.href = '/chama'}
                >
                  <Users className="mr-2 h-5 w-5" />
                  Browse Chamas
                </Button>
              </div>
            </div>

            {/* Hero Image */}
            <div className="hidden md:block">
              <img 
                src={heroImage} 
                alt="Community savings and crowdfunding platform" 
                className="rounded-2xl shadow-2xl w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Why Choose Us?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Empowering communities with secure, transparent financial tools
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <section className="bg-card py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-card-foreground mb-4">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Mchango */}
            <div className="space-y-6">
              <div className="inline-block px-4 py-2 bg-gradient-to-r from-secondary to-secondary-glow rounded-full">
                <span className="text-secondary-foreground font-semibold">Mchango</span>
              </div>
              <h3 className="text-2xl font-bold text-card-foreground">Start a Fundraiser</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Create Campaign</h4>
                    <p className="text-muted-foreground">Set your goal and share your story</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Share & Promote</h4>
                    <p className="text-muted-foreground">Reach supporters across platforms</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-secondary/20 rounded-full flex items-center justify-center text-secondary font-semibold">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Receive Funds</h4>
                    <p className="text-muted-foreground">Get contributions directly to your account</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Chama */}
            <div className="space-y-6">
              <div className="inline-block px-4 py-2 bg-gradient-to-r from-primary to-primary-glow rounded-full">
                <span className="text-primary-foreground font-semibold">Chama</span>
              </div>
              <h3 className="text-2xl font-bold text-card-foreground">Join Savings Group</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Create or Join</h4>
                    <p className="text-muted-foreground">Start a group or join existing chamas</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Contribute Regularly</h4>
                    <p className="text-muted-foreground">Make scheduled contributions together</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-semibold">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-card-foreground">Grow Wealth</h4>
                    <p className="text-muted-foreground">Watch your savings multiply over time</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Join our growing community and take control of your financial future today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="xl" onClick={() => window.location.href = '/auth'}>
              Start a Mchango
            </Button>
            <Button variant="heroSecondary" size="xl" onClick={() => window.location.href = '/auth'}>
              Join a Chama
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <p className="text-muted-foreground">
              &copy; 2025 Chama & Mchango. Building financial futures together.
            </p>
            <div className="flex items-center gap-3">
              <img 
                src={profilePhoto} 
                alt="Declark Chacha" 
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/20 shadow-md"
              />
              <p className="text-sm text-muted-foreground">
                Website created by <span className="font-semibold text-foreground">Declark Chacha</span>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
