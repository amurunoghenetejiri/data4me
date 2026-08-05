import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AuthModal } from "../AuthModal";
import { LiveActivity } from "../LiveActivity";
import { InstallAppPrompt } from "../InstallAppPrompt";
import { PushPermissionPrompt } from "../PushPermissionPrompt";

const D4AIAssistant = lazy(() => import("../ai/D4AIAssistant"));

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-11 sm:pt-16 md:pt-18 animate-fade-in">
        <Outlet />
      </main>

      <Footer />
      <AuthModal />
      <LiveActivity />
      <InstallAppPrompt />
      <PushPermissionPrompt />
      <Suspense fallback={null}>
        <D4AIAssistant />
      </Suspense>
    </div>
  );
}

