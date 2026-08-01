import Link from "next/link";

const Footer = () => {
  return (
    <footer className="mt-16 border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-mono text-sm text-foreground">
          <span className="inline-block size-2 rounded-full bg-foreground" />
          <span className="tracking-brand uppercase">DocWise</span>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-label text-muted-foreground">
          <Link href="#" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="#" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link
            href="https://github.com/dheeraj3587"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </Link>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
