import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import MchangoCreate from "./pages/MchangoCreate";
import MchangoDetail from "./pages/MchangoDetail";
import ChamaCreate from "./pages/ChamaCreate";
import ChamaDetail from "./pages/ChamaDetail";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import AdminKYC from "./pages/AdminKYC";
import KYCUpload from "./pages/KYCUpload";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/kyc-upload" element={<ProtectedRoute><KYCUpload /></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/mchango/create" element={<ProtectedRoute requireKYC><MchangoCreate /></ProtectedRoute>} />
          <Route path="/mchango/:id" element={<MchangoDetail />} />
          <Route path="/chama/create" element={<ProtectedRoute requireKYC><ChamaCreate /></ProtectedRoute>} />
          <Route path="/chama/:id" element={<ChamaDetail />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/admin/kyc" element={<ProtectedRoute><AdminKYC /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
