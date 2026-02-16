import { Heart } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border mt-12 sm:mt-20 surface-1">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 text-center text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
        <p className="text-xs sm:text-sm flex justify-center items-center gap-2">
          Made with
          <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-destructive fill-destructive" />
          by Dheeraj Joshi
        </p>
        <p className="text-xs sm:text-sm flex justify-center items-center gap-2">
          <a
            href="https://github.com/dheeraj3587"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
