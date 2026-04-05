import { Card } from "@/components/ui/card";
import { Users, Target, Heart, Shield, Award, CheckCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import declarkPhoto from "@/assets/declark-chacha-ceo.jpg";
import { Button } from "@/components/ui/button";

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Back Navigation */}
      <div className="container mx-auto px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-secondary/10 py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            About PAMOJA NOVA
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Empowering Kenyan communities through innovative financial solutions
            for collective savings, fundraising, and group investments.
          </p>
        </div>
      </section>

      {/* Company Story */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold mb-8 text-foreground">Our Story</h2>
          <div className="prose prose-lg max-w-none">
            <p className="text-muted-foreground mb-4">
              Founded in August 2025, PAMOJA NOVA was born from a simple observation: 
              traditional savings groups (chamas) and fundraising campaigns (mchango) 
              faced challenges with transparency, security, and accessibility.
            </p>
            <p className="text-muted-foreground mb-4">
              We set out to modernize these time-honored Kenyan traditions by creating 
              a digital platform that maintains the community spirit while adding 
              bank-level security, automated tracking, and seamless mobile money integration.
            </p>
            <p className="text-muted-foreground">
              Today, we serve thousands of members across Kenya, helping them achieve 
              their financial goals through Chama groups, Mchango campaigns, and 
              verified Organizations (NGOs, Churches, Schools, and more).
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="p-8">
              <Target className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-2xl font-bold mb-4 text-foreground">Our Mission</h3>
              <p className="text-muted-foreground">
                To provide accessible, secure, and innovative financial tools that 
                empower Kenyan communities to save, fundraise, and invest collectively, 
                building wealth and achieving shared goals.
              </p>
            </Card>
            <Card className="p-8">
              <Award className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-2xl font-bold mb-4 text-foreground">Our Vision</h3>
              <p className="text-muted-foreground">
                To become Kenya's leading platform for community-based financial 
                solutions, transforming how people collaborate to achieve financial 
                independence and prosperity.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold mb-12 text-center text-foreground">
            Our Core Values
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 text-center">
              <Shield className="h-10 w-10 text-primary mx-auto mb-4" />
              <h4 className="font-bold mb-2 text-foreground">Security First</h4>
              <p className="text-sm text-muted-foreground">
                Bank-level encryption and KYC verification to protect every transaction
              </p>
            </Card>
            <Card className="p-6 text-center">
              <Heart className="h-10 w-10 text-primary mx-auto mb-4" />
              <h4 className="font-bold mb-2 text-foreground">Community Driven</h4>
              <p className="text-sm text-muted-foreground">
                Built for Kenyans, by Kenyans, honoring our traditions
              </p>
            </Card>
            <Card className="p-6 text-center">
              <CheckCircle className="h-10 w-10 text-primary mx-auto mb-4" />
              <h4 className="font-bold mb-2 text-foreground">Transparency</h4>
              <p className="text-sm text-muted-foreground">
                Real-time tracking and clear reporting for all financial activities
              </p>
            </Card>
            <Card className="p-6 text-center">
              <Users className="h-10 w-10 text-primary mx-auto mb-4" />
              <h4 className="font-bold mb-2 text-foreground">Accessibility</h4>
              <p className="text-sm text-muted-foreground">
                Easy-to-use platform integrated with M-Pesa and Airtel Money
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold mb-12 text-center text-foreground">
            Our Leadership Team
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <Card className="p-6 text-center">
              <img src={declarkPhoto} alt="Declark Okemwa Chacha - CEO" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
              <h4 className="font-bold text-lg mb-1 text-foreground">Declark Okemwa Chacha</h4>
              <p className="text-sm text-primary mb-2">Chief Executive Officer</p>
              <p className="text-sm text-muted-foreground">
                6+ years in fintech and mobile money solutions
              </p>
            </Card>
            <Card className="p-6 text-center">
              <div className="w-24 h-24 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Users className="h-12 w-12 text-primary" />
              </div>
              <h4 className="font-bold text-lg mb-1 text-foreground">GM</h4>
              <p className="text-sm text-primary mb-2">Chief Operations Officer</p>
              <p className="text-sm text-muted-foreground">
                Specialist in community-based financial services
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Registration & Legal */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <Card className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-foreground">
              Company Registration & Legal Information
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <div className="flex justify-between border-b border-border pb-3">
                <span className="font-medium">Registered Name:</span>
               <span>PAMOJA NOVA Limited</span>
               </div>
               <div className="flex justify-between border-b border-border pb-3">
                 <span className="font-medium">Business Registration:</span>
                 <span>PVT-BN-RRSK656P</span>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <span className="font-medium">Registered Office:</span>
                <span>Nairobi, Kenya</span>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <span className="font-medium">Licensed By:</span>
                <span>Central Bank of Kenya (Pending)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Compliance:</span>
                <span>KYC/AML Compliant</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h3 className="text-2xl font-bold mb-8 text-foreground">Trusted & Secure</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex flex-col items-center">
              <Shield className="h-12 w-12 text-primary mb-2" />
              <span className="text-sm font-medium text-foreground">SSL Encrypted</span>
            </div>
            <div className="flex flex-col items-center">
              <CheckCircle className="h-12 w-12 text-primary mb-2" />
              <span className="text-sm font-medium text-foreground">KYC Verified</span>
            </div>
            <div className="flex flex-col items-center">
              <Award className="h-12 w-12 text-primary mb-2" />
              <span className="text-sm font-medium text-foreground">Licensed Platform</span>
            </div>
            <div className="flex flex-col items-center">
              <Users className="h-12 w-12 text-primary mb-2" />
              <span className="text-sm font-medium text-foreground">10,000+ Members</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
