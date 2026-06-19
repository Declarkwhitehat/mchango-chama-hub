import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { SuperAdminProtectedRoute } from "./components/SuperAdminProtectedRoute";

import { ChatSupport } from "./components/ChatSupport";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NativeDeepLinkHandler } from "./components/NativeDeepLinkHandler";
import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { Loader2 } from "lucide-react";
import { usePushNotifications } from "./hooks/usePushNotifications";
import React from "react";
import { warmUpNativePlugins } from "./lib/nativePermissions";
import { MaintenanceGate } from "./components/MaintenanceGate";
import { AppFreshness } from "./components/AppFreshness";



// Lazy load all pages for better initial load performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Home = lazy(() => import("./pages/Home"));
const MchangoList = lazy(() => import("./pages/MchangoList"));
const MchangoCreate = lazy(() => import("./pages/MchangoCreate"));
const MchangoDetail = lazy(() => import("./pages/MchangoDetail"));
const MchangoExplore = lazy(() => import("./pages/MchangoExplore"));
const OrganizationList = lazy(() => import("./pages/OrganizationList"));
const OrganizationCreate = lazy(() => import("./pages/OrganizationCreate"));
const OrganizationDetail = lazy(() => import("./pages/OrganizationDetail"));
const ChamaCreate = lazy(() => import("./pages/ChamaCreate"));
const ChamaDetail = lazy(() => import("./pages/ChamaDetail"));
const ChamaJoin = lazy(() => import("./pages/ChamaJoin"));
const ChamaList = lazy(() => import("./pages/ChamaList"));
const Profile = lazy(() => import("./pages/Profile"));
const Activity = lazy(() => import("./pages/Activity"));
const KYCUpload = lazy(() => import("./pages/KYCUpload"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const WelfareCreate = lazy(() => import("./pages/WelfareCreate"));
const WelfareList = lazy(() => import("./pages/WelfareList"));
const WelfareDetail = lazy(() => import("./pages/WelfareDetail"));
const WelfareJoin = lazy(() => import("./pages/WelfareJoin"));
const PinSetup = lazy(() => import("./pages/PinSetup"));
const Security = lazy(() => import("./pages/Security"));

// Admin pages - lazy loaded
const AdminKYC = lazy(() => import("./pages/AdminKYC"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUserDetail = lazy(() => import("./pages/AdminUserDetail"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminWithdrawals = lazy(() => import("./pages/AdminWithdrawals"));
const AdminChamas = lazy(() => import("./pages/AdminChamas"));
const AdminWelfares = lazy(() => import("./pages/AdminWelfares"));
const AdminChamaDetail = lazy(() => import("./pages/AdminChamaDetail"));
const AdminCampaigns = lazy(() => import("./pages/AdminCampaigns"));
const AdminCampaignDetail = lazy(() => import("./pages/AdminCampaignDetail"));
const AdminCallbacks = lazy(() => import("./pages/AdminCallbacks"));
const AdminAudit = lazy(() => import("./pages/AdminAudit"));
const AdminExport = lazy(() => import("./pages/AdminExport"));
const AdminSearch = lazy(() => import("./pages/AdminSearch"));
const AdminPaymentConfig = lazy(() => import("./pages/AdminPaymentConfig"));
const AdminOrganizations = lazy(() => import("./pages/AdminOrganizations"));
const AdminOrganizationDetail = lazy(() => import("./pages/AdminOrganizationDetail"));
const AdminLedger = lazy(() => import("./pages/AdminLedger"));
const AdminVerificationRequests = lazy(() => import("./pages/AdminVerificationRequests"));
const AdminCommissionAnalytics = lazy(() => import("./pages/AdminCommissionAnalytics"));
const AdminMpesaSearch = lazy(() => import("./pages/AdminMpesaSearch"));
const AdminFraudMonitoring = lazy(() => import("./pages/AdminFraudMonitoring"));
const AdminFraudUserDetail = lazy(() => import("./pages/AdminFraudUserDetail"));
const AdminFraudConfig = lazy(() => import("./pages/AdminFraudConfig"));
const AdminPayoutApprovals = lazy(() => import("./pages/AdminPayoutApprovals"));
const AdminRevenue = lazy(() => import("./pages/AdminRevenue"));
const AdminWelfareExecutiveChanges = lazy(() => import("./pages/AdminWelfareExecutiveChanges"));
const AdminDocuments = lazy(() => import("./pages/AdminDocuments"));
const AdminCommissionConfig = lazy(() => import("./pages/AdminCommissionConfig"));
const AdminSuperManagers = lazy(() => import("./pages/AdminSuperManagers"));
const AdminDocumentDeletions = lazy(() => import("./pages/AdminDocumentDeletions"));
const AdminAccountVerifications = lazy(() => import("./pages/AdminAccountVerifications"));
const AdminMaintenanceMode = lazy(() => import("./pages/AdminMaintenanceMode"));
const AdminSmsBalance = lazy(() => import("./pages/AdminSmsBalance"));
const AdminSmsBroadcast = lazy(() => import("./pages/AdminSmsBroadcast"));
const AdminPaybillBalance = lazy(() => import("./pages/AdminPaybillBalance"));
const AccountVerification = lazy(() => import("./pages/AccountVerification"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,            // 30s – fresher data, especially after returning to the app
      gcTime: 10 * 60 * 1000,           // 10 min – keep unused cache entries
      refetchOnWindowFocus: true,       // refetch when tab/app regains focus
      refetchOnMount: true,
      retry: 1,                          // single retry on failure
      refetchOnReconnect: 'always',      // refetch after offline→online
    },
  },
});


const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const PushNotificationInit = ({ enabled }: { enabled: boolean }) => {
  usePushNotifications({ enabled });
  React.useEffect(() => {
    if (!enabled) return;
    warmUpNativePlugins();
  }, [enabled]);
  return null;
};

const AppContent = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAuthFlowRoute = ['/auth', '/forgot-password', '/reset-password'].includes(location.pathname);
  
  return (
    <>
      <Toaster />
      <Sonner />
      
      <NativeDeepLinkHandler />
      <AppFreshness />
      <PushNotificationInit enabled={!isAuthFlowRoute} />

      {!isAdminRoute && <ChatSupport />}
      {!isAdminRoute && <InstallAppPrompt />}
      <MaintenanceGate>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/kyc-upload" element={<ProtectedRoute><KYCUpload /></ProtectedRoute>} />
            <Route path="/pin-setup" element={<ProtectedRoute><PinSetup /></ProtectedRoute>} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/mchango" element={<MchangoList />} />
            <Route path="/mchango/create" element={<ProtectedRoute requireKYC><MchangoCreate /></ProtectedRoute>} />
            <Route path="/mchango/:id" element={<MchangoDetail />} />
            <Route path="/explore/mchango" element={<MchangoExplore />} />
            <Route path="/organizations" element={<OrganizationList />} />
            <Route path="/organizations/create" element={<ProtectedRoute requireKYC><OrganizationCreate /></ProtectedRoute>} />
            <Route path="/organizations/:id" element={<OrganizationDetail />} />
            <Route path="/chama" element={<ChamaList />} />
            <Route path="/chama/create" element={<ProtectedRoute requireKYC><ChamaCreate /></ProtectedRoute>} />
            <Route path="/chama/join/:slug" element={<ChamaJoin />} />
            <Route path="/chama/:id" element={<ChamaDetail />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
            <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
            <Route path="/welfare" element={<WelfareList />} />
            <Route path="/welfare/create" element={<ProtectedRoute requireKYC><WelfareCreate /></ProtectedRoute>} />
            <Route path="/welfare/join/:slug" element={<WelfareJoin />} />
            <Route path="/welfare/:id" element={<WelfareDetail />} />
            <Route path="/admin" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
            <Route path="/admin/kyc" element={<AdminProtectedRoute><AdminKYC /></AdminProtectedRoute>} />
            <Route path="/admin/users" element={<AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>} />
            <Route path="/admin/user/:userId" element={<AdminProtectedRoute><AdminUserDetail /></AdminProtectedRoute>} />
            <Route path="/admin/transactions" element={<AdminProtectedRoute><AdminTransactions /></AdminProtectedRoute>} />
            <Route path="/admin/withdrawals" element={<AdminProtectedRoute><AdminWithdrawals /></AdminProtectedRoute>} />
            <Route path="/admin/chamas" element={<AdminProtectedRoute><AdminChamas /></AdminProtectedRoute>} />
            <Route path="/admin/chama/:chamaId" element={<AdminProtectedRoute><AdminChamaDetail /></AdminProtectedRoute>} />
            <Route path="/admin/campaigns" element={<AdminProtectedRoute><AdminCampaigns /></AdminProtectedRoute>} />
            <Route path="/admin/campaign/:campaignId" element={<AdminProtectedRoute><AdminCampaignDetail /></AdminProtectedRoute>} />
            <Route path="/admin/organizations" element={<AdminProtectedRoute><AdminOrganizations /></AdminProtectedRoute>} />
            <Route path="/admin/organization/:organizationId" element={<AdminProtectedRoute><AdminOrganizationDetail /></AdminProtectedRoute>} />
            <Route path="/admin/welfares" element={<AdminProtectedRoute><AdminWelfares /></AdminProtectedRoute>} />
            <Route path="/admin/callbacks" element={<AdminProtectedRoute><AdminCallbacks /></AdminProtectedRoute>} />
            <Route path="/admin/audit" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminAudit /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/search" element={<AdminProtectedRoute><AdminSearch /></AdminProtectedRoute>} />
            <Route path="/admin/export" element={<AdminProtectedRoute><AdminExport /></AdminProtectedRoute>} />
            <Route path="/admin/payment-config" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminPaymentConfig /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/ledger" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminLedger /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/verification-requests" element={<AdminProtectedRoute><AdminVerificationRequests /></AdminProtectedRoute>} />
            <Route path="/admin/commission-analytics" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminCommissionAnalytics /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/payment-search" element={<AdminProtectedRoute><AdminMpesaSearch /></AdminProtectedRoute>} />
            <Route path="/admin/fraud-monitoring" element={<AdminProtectedRoute><AdminFraudMonitoring /></AdminProtectedRoute>} />
            <Route path="/admin/fraud-user/:userId" element={<AdminProtectedRoute><AdminFraudUserDetail /></AdminProtectedRoute>} />
            <Route path="/admin/fraud-config" element={<AdminProtectedRoute><AdminFraudConfig /></AdminProtectedRoute>} />
            <Route path="/admin/payout-approvals" element={<AdminProtectedRoute><AdminPayoutApprovals /></AdminProtectedRoute>} />
            <Route path="/admin/revenue" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminRevenue /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/welfare-executive-changes" element={<AdminProtectedRoute><AdminWelfareExecutiveChanges /></AdminProtectedRoute>} />
            <Route path="/admin/documents" element={<AdminProtectedRoute><AdminDocuments /></AdminProtectedRoute>} />
            <Route path="/admin/commission-config" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminCommissionConfig /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/super-managers" element={<AdminProtectedRoute><AdminSuperManagers /></AdminProtectedRoute>} />
            <Route path="/admin/document-deletions" element={<AdminProtectedRoute><AdminDocumentDeletions /></AdminProtectedRoute>} />
            <Route path="/admin/account-verifications" element={<AdminProtectedRoute><AdminAccountVerifications /></AdminProtectedRoute>} />
            <Route path="/admin/maintenance" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminMaintenanceMode /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/sms-balance" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminSmsBalance /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/sms-broadcast" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminSmsBroadcast /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/admin/paybill-balance" element={<AdminProtectedRoute><SuperAdminProtectedRoute><AdminPaybillBalance /></SuperAdminProtectedRoute></AdminProtectedRoute>} />
            <Route path="/account/verify" element={<ProtectedRoute><AccountVerification /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MaintenanceGate>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
