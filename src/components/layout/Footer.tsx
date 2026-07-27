import { Link } from "react-router-dom";
import { Twitter, Facebook, Instagram, Mail } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-muted/30">
      <div className="container py-10 flex justify-center">
        <div className="max-w-md text-center">
          <Link to="/" className="flex items-center justify-center gap-1 mb-3">
            <BrandMark size={60} />
            <span className="font-bold text-lg">Data<span className="text-gradient">4Me</span></span>
          </Link>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Instant, affordable data & airtime for MTN, Glo, Airtel and 9mobile. Built for Nigeria.</p>
          <div className="flex justify-center gap-3 mt-4">
            {[Twitter, Facebook, Instagram, Mail].map((Icon, i) => (
              <a key={i} href="#" className="h-9 w-9 rounded-full bg-background border border-border grid place-items-center hover:bg-accent hover:text-primary transition"><Icon className="h-4 w-4" /></a>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container py-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} <span className="font-semibold text-foreground"> D4 TECH </span> All Rights Reserved.</p>
          <p>Data4Me • Designed & Developed by D4 TECH.</p>
        </div>
      </div>
    </footer>
  );
}
