import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
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
import SavingsGroupJoin from "./pages/SavingsGroupJoin";
import SavingsGroupDetail from "./pages/SavingsGroupDetail";
import MemberActivity from "./pages/MemberActivity";
import Activity from "./pages/Activity";
import AdminKYC from "./pages/AdminKYC";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminTransactions from "./pages/AdminTransactions";
import AdminWithdrawals from "./pages/AdminWithdrawals";
import AdminChamas from "./pages/AdminChamas";
import AdminSavingsGroups from "./pages/AdminSavingsGroups";
import AdminCampaigns from "./pages/AdminCampaigns";
import AdminCallbacks from "./pages/AdminCallbacks";
import AdminAudit from "./pages/AdminAudit";
import AdminAdjustments from "./pages/AdminAdjustments";
import AdminExport from "./pages/AdminExport";
import KYCUpload from "./pages/KYCUpload";
import NotFound from "./pages/NotFound";
import AboutUs from "./pages/AboutUs";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { ChatSupport } from "./components/ChatSupport";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <ChatSupport />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/about" element={<AboutUs />} />
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
          <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
          
          {/* Savings Group Routes */}
          <Route path="/savings-groups" element={<ProtectedRoute><SavingsGroupList /></ProtectedRoute>} />
          <Route path="/savings-groups/create" element={<ProtectedRoute requireKYC><SavingsGroupCreate /></ProtectedRoute>} />
          <Route path="/savings-groups/join" element={<SavingsGroupJoin />} />
          <Route path="/savings-groups/:id" element={<ProtectedRoute><SavingsGroupDetail /></ProtectedRoute>} />
          <Route path="/savings-groups/:groupId/activity" element={<ProtectedRoute><MemberActivity /></ProtectedRoute>} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
          <Route path="/admin/kyc" element={<AdminProtectedRoute><AdminKYC /></AdminProtectedRoute>} />
          <Route path="/admin/users" element={<AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>} />
          <Route path="/admin/user/:userId" element={<AdminProtectedRoute><AdminUserDetail /></AdminProtectedRoute>} />
          <Route path="/admin/transactions" element={<AdminProtectedRoute><AdminTransactions /></AdminProtectedRoute>} />
          <Route path="/admin/withdrawals" element={<AdminProtectedRoute><AdminWithdrawals /></AdminProtectedRoute>} />
          <Route path="/admin/chamas" element={<AdminProtectedRoute><AdminChamas /></AdminProtectedRoute>} />
          <Route path="/admin/savings-groups" element={<AdminProtectedRoute><AdminSavingsGroups /></AdminProtectedRoute>} />
          <Route path="/admin/campaigns" element={<AdminProtectedRoute><AdminCampaigns /></AdminProtectedRoute>} />
          <Route path="/admin/callbacks" element={<AdminProtectedRoute><AdminCallbacks /></AdminProtectedRoute>} />
          <Route path="/admin/audit" element={<AdminProtectedRoute><AdminAudit /></AdminProtectedRoute>} />
          <Route path="/admin/adjustments" element={<AdminProtectedRoute><AdminAdjustments /></AdminProtectedRoute>} />
          <Route path="/admin/export" element={<AdminProtectedRoute><AdminExport /></AdminProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
