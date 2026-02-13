import { motion } from "framer-motion";

export default function LoadingPage() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-10">
        {/* Elegant Spinner */}
        <motion.div
          className="w-14 h-14 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />

        {/* Subtle Brand Line */}
        <div className="w-24 h-px bg-[#D4AF37]/40" />

        {/* Minimal Text */}
        <motion.p
          className="text-[#D4AF37] text-sm tracking-[0.35em] font-light"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
        >
          LOADING
        </motion.p>
      </div>
    </div>
  );
}
