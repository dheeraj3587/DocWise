import { motion } from "framer-motion";

export default function LoadingPage() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-10">
        <motion.div
          className="w-14 h-14 rounded-full border-2 border-gold/30 border-t-gold"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        <div className="w-24 h-px bg-gold/40" />
        <motion.p
          className="text-gold text-sm tracking-[0.35em] font-light"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
        >
          LOADING
        </motion.p>
      </div>
    </div>
  );
}
