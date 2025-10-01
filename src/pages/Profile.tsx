import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, MapPin, LogOut, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Profile = () => {
  const navigate = useNavigate();

  // Mock user data
  const user = {
    name: "John Kamau",
    email: "john.kamau@example.com",
    phone: "+254 712 345 678",
    location: "Nairobi, Kenya",
    joinedDate: "June 2025",
    mchangoCount: 3,
    chamaCount: 2,
    totalContributed: 45000,
  };

  const handleLogout = () => {
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <Layout>
      <div className="container px-4 py-6 pb-24 max-w-2xl mx-auto space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  {user.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
                <p className="text-muted-foreground">Member since {user.joinedDate}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{user.mchangoCount} Campaigns</Badge>
                <Badge variant="secondary">{user.chamaCount} Groups</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Contributed</span>
                <span className="text-xl font-bold text-primary">
                  KES {user.totalContributed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Campaigns</span>
                <span className="font-semibold text-foreground">{user.mchangoCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Chama Groups</span>
                <span className="font-semibold text-foreground">{user.chamaCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Personal Information</CardTitle>
              <Button variant="ghost" size="sm">
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Full Name</Label>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.email}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Phone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.phone}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Location</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.location}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="pt-6">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Profile;
