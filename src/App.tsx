import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import Layout from "@/components/layout/Layout";
import Home from "./pages/Home";
import BuyData from "./pages/BuyData";
import BuyAirtime from "./pages/BuyAirtime";
import Networks from "./pages/Networks";
import Pricing from "./pages/Pricing";
import Transactions from "./pages/Transactions";
import Wallet from "./pages/Wallet";
import Transfer from "./pages/Transfer";
import ResetPassword from "./pages/ResetPassword";
import Cable from "./pages/Cable";
import Electricity from "./pages/Electricity";
import Dashboard from "./pages/Dashboard";
import FAQ from "./pages/FAQ";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Support from "./pages/Support";
import { Terms, Privacy } from "./pages/Legal";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import Bank from "./pages/Bank";
import Withdraw from "./pages/Withdraw";
import Chat from "./pages/Chat";
import AdminLayout from "./pages/admin/_layout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminUserDetail from "./pages/admin/UserDetail";
import AdminTransactions from "./pages/admin/Transactions";
import AdminDeposits from "./pages/admin/Deposits";
import AdminWithdrawals from "./pages/admin/Withdrawals";
import ReceiptQueue from "./pages/admin/ReceiptQueue";
import AdminProducts from "./pages/admin/Products";
import AdminDataPlans from "./pages/admin/DataPlans";
import AdminAuditLogs from "./pages/admin/AuditLogs";
import AdminSettings from "./pages/admin/Settings";
import AdminPaymentSettings from "./pages/admin/PaymentSettings";
import AdminPricingCharges from "./pages/admin/PricingCharges";
import AdminActivityCenter from "./pages/admin/ActivityCenter";
import AdminBroadcast from "./pages/admin/Notifications";
import { KycPage, ReportsPage, AdminAccountsPage, SecurityPage, SupportPage, DatabasePage } from "./pages/admin/Misc";
import AdminSmeapiStatus from "./pages/admin/SmeapiStatus";
import AdminMessages from "./pages/admin/Messages";
import Messages from "./pages/Messages";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="users/:id" element={<AdminUserDetail />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="deposits" element={<AdminDeposits />} />
              <Route path="receipt-queue" element={<ReceiptQueue />} />
              <Route path="withdrawals" element={<AdminWithdrawals />} />
              <Route path="kyc" element={<KycPage />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="data-plans" element={<AdminDataPlans />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="notifications" element={<AdminBroadcast />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="payment-settings" element={<AdminPaymentSettings />} />
              <Route path="pricing-charges" element={<AdminPricingCharges />} />
              <Route path="activity" element={<AdminActivityCenter />} />
              <Route path="accounts" element={<AdminAccountsPage />} />
              <Route path="audit" element={<AdminAuditLogs />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="database" element={<DatabasePage />} />
              <Route path="smeapi-status" element={<AdminSmeapiStatus />} />
              <Route path="messages" element={<AdminMessages />} />
            </Route>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/buy-data" element={<BuyData />} />
              <Route path="/buy-airtime" element={<BuyAirtime />} />
              <Route path="/networks" element={<Networks />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transfer" element={<Transfer />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/cable" element={<Cable />} />
              <Route path="/electricity" element={<Electricity />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/support" element={<Support />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/bank" element={<Bank />} />
              <Route path="/withdraw" element={<Withdraw />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
