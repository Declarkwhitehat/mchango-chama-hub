import { Button } from "@/components/ui/button";
import { Menu, X, LogIn, UserPlus, Users, Heart, PiggyBank, User, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut, profile } = useAuth();
  const { toast } = useToast();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/");
      toast({
        title: "Success",
        description: "Signed out successfully",
      });
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <div 
            className="flex items-center cursor-pointer" 
            onClick={() => navigate('/')}
          >
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Chama & Mchango
            </h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2 lg:gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/chama')}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Browse Chamas
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => navigate('/mchango')}
              className="gap-2"
            >
              <Heart className="h-4 w-4" />
              Browse Campaigns
            </Button>
            {user && profile?.kyc_status === 'approved' && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/savings-group')}
                className="gap-2"
              >
                <PiggyBank className="h-4 w-4" />
                Savings Groups
              </Button>
            )}
            {user ? (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/profile')}
                  className="gap-2"
                >
                  <User className="h-4 w-4" />
                  Profile
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleSignOut}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/auth')}
                  className="gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Login
                </Button>
                <Button 
                  onClick={() => navigate('/auth')}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </Button>
              </>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 sm:py-4 border-t border-border animate-in slide-in-from-top-2">
            <nav className="flex flex-col gap-1.5 sm:gap-2">
              <Button 
                variant="ghost" 
                onClick={() => {
                  navigate('/chama');
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start gap-2"
              >
                <Users className="h-4 w-4" />
                Browse Chamas
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  navigate('/mchango');
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start gap-2"
              >
                <Heart className="h-4 w-4" />
                Browse Campaigns
              </Button>
              {user && profile?.kyc_status === 'approved' && (
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    navigate('/savings-group');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full justify-start gap-2"
                >
                  <PiggyBank className="h-4 w-4" />
                  Savings Groups
                </Button>
              )}
              {user ? (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      navigate('/profile');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full justify-start gap-2"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full justify-start gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      navigate('/auth');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full justify-start gap-2"
                  >
                    <LogIn className="h-4 w-4" />
                    Login
                  </Button>
                  <Button 
                    onClick={() => {
                      navigate('/auth');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full justify-start gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Sign Up
                  </Button>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
