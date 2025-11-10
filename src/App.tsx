import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import MchangoList from "./pages/MchangoList";
import MchangoCreate from "./pages/MchangoCreate";
import MchangoDetail from "./pages/MchangoDetail";
import ChamaCreate from "./pages/ChamaCreate";
import ChamaDetail from "./pages/ChamaDetail";
import ChamaJoin from "./pages/ChamaJoin";
import ChamaList from "./pages/ChamaList";
import Profile from "./pages/Profile";
import SavingsGroupList from "./pages/SavingsGroupList";
import SavingsGroupCreate from "./pages/SavingsGroupCreate";
import SavingsGroupDetail from "./pages/SavingsGroupDetail";
import Admin from "./pages/Admin";
import AdminKYC from "./pages/AdminKYC";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUserDetail from "./pages/AdminUserDetail";
import KYCUpload from "./pages/KYCUpload";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/kyc-upload" element={<ProtectedRoute><KYCUpload /></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/mchango" element={<MchangoList />} />
          <Route path="/mchango/create" element={<ProtectedRoute requireKYC><MchangoCreate /></ProtectedRoute>} />
          <Route path="/mchango/:id" element={<MchangoDetail />} />
          <Route path="/chama" element={<ChamaList />} />
          <Route path="/chama/create" element={<ProtectedRoute requireKYC><ChamaCreate /></ProtectedRoute>} />
          <Route path="/chama/join/:slug" element={<ChamaJoin />} />
          <Route path="/chama/:id" element={<ChamaDetail />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          
          {/* Savings Group Routes */}
          <Route path="/savings-group" element={<ProtectedRoute><SavingsGroupList /></ProtectedRoute>} />
          <Route path="/savings-group/create" element={<ProtectedRoute requireKYC><SavingsGroupCreate /></ProtectedRoute>} />
          <Route path="/savings-group/:id" element={<ProtectedRoute><SavingsGroupDetail /></ProtectedRoute>} />
          
          <Route path="/admin" element={<AdminProtectedRoute><Admin /></AdminProtectedRoute>} />
          <Route path="/admin/kyc" element={<AdminProtectedRoute><AdminKYC /></AdminProtectedRoute>} />
          <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
          <Route path="/admin/user/:userId" element={<AdminProtectedRoute><AdminUserDetail /></AdminProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
