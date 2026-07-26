import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { AuthModal } from "../AuthModal";
import { LiveActivity } from "../LiveActivity";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 animate-fade-in">
  <Outlet />
</main>
        <Outlet />
      </main>
      <Footer />
      <AuthModal />
      <LiveActivity />
    </div>
  );
}
