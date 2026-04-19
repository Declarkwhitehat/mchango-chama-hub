import { Link } from "react-router-dom";
import { Instagram, Facebook, Twitter } from "lucide-react";

const BUILD_VERSION = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.1';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container py-6 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Company Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Chama Platform</h3>
            <p className="text-sm text-muted-foreground">
              Empowering communities through collective savings, fundraising, and financial growth.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <a href="mailto:info@pamojanova.com" className="text-muted-foreground hover:text-foreground transition-colors">
                  Contact Support
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Contact</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Email: <a href="mailto:info@pamojanova.com" className="hover:text-foreground transition-colors">info@pamojanova.com</a></li>
              <li>Phone: <a href="tel:+254707874790" className="hover:text-foreground transition-colors">+254 707 874 790</a></li>
              <li>Nairobi, Kenya</li>
            </ul>
            <div className="flex gap-4 mt-4">
              <a
                href="https://www.instagram.com/4447de?igsh=MW90ZXZiYTk3ZTcxdA=="
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61588113465884"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com/yourhandle"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {currentYear} Chama Platform. All rights reserved. | Build {BUILD_VERSION}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;