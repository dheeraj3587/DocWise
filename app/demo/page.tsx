"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const VIEWBOX_X = 520;
const VIEWBOX_Y = 230;
const VIEWBOX_WIDTH = 520;
const VIEWBOX_HEIGHT = 520;
const VIEWBOX_MAX_X = VIEWBOX_X + VIEWBOX_WIDTH;
const VIEWBOX_MAX_Y = VIEWBOX_Y + VIEWBOX_HEIGHT;
const GRADIENT_RADIUS = 400;
const DEFAULT_CX = VIEWBOX_X + VIEWBOX_WIDTH / 2;
const DEFAULT_CY = VIEWBOX_Y + VIEWBOX_HEIGHT / 2;

const DOCWISE_LOGO_PATH =
  "M 624 256.980 C 573.695 257.814, 571.702 258.213, 563.736 269.045 C 556.420 278.993, 559.566 291.334, 583.729 347.460 C 600.533 386.492, 602.961 389.586, 621.952 396.170 C 630.771 399.228, 651.763 399.935, 734.750 399.969 L 811 400 811 407.818 C 811 424.400, 802.562 440.823, 787.076 454.382 C 774.997 464.958, 779.412 464.378, 705 465.159 C 630.097 465.944, 627.534 466.059, 619.753 468.982 C 606.040 474.134, 596.693 488.516, 560.726 559.805 C 547.375 586.268, 547.754 588.946, 572.603 643.726 C 596.074 695.466, 598.874 699.035, 615.946 698.978 C 631.121 698.927, 638.449 691.883, 655.974 660.500 C 667.185 640.425, 672.413 635.011, 680.593 635.004 C 693.035 634.992, 701.353 646.042, 713.712 679 C 721.631 700.114, 726.473 706.590, 738.533 712.192 C 744.550 714.988, 805.709 715.729, 899 714.137 C 955.185 713.178, 955.594 713.137, 963.651 707.723 C 977.716 698.271, 977.693 693.886, 963.370 654.132 C 940.505 590.666, 941.160 592.223, 934.246 584.832 C 923.035 572.846, 920.311 572.438, 839 570.572 C 725.144 567.957, 735.150 568.963, 732.979 559.914 C 729.158 543.984, 734.954 526.790, 748.693 513.298 C 756.374 505.756, 753.656 506.015, 825.500 505.980 C 929.609 505.929, 920.932 509.732, 952.090 450.500 C 987.700 382.804, 987.352 390.586, 958.344 310.652 C 943.685 270.257, 941.110 265.754, 929.602 260.395 C 913.751 253.014, 903.638 259.323, 885.296 288.036 C 854.924 335.581, 851.247 335.906, 829 293 C 809.407 255.214, 814.356 256.980, 727 256.589 C 692.625 256.435, 646.275 256.611, 624 256.980";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function DemoPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerX = useMotionValue(DEFAULT_CX);
  const pointerY = useMotionValue(DEFAULT_CY);

  const gradientCx = useSpring(
    useTransform(pointerX, (value) => clamp(value, VIEWBOX_X, VIEWBOX_MAX_X)),
    { stiffness: 150, damping: 24, mass: 0.35 },
  );
  const gradientCy = useSpring(
    useTransform(pointerY, (value) => clamp(value, VIEWBOX_Y, VIEWBOX_MAX_Y)),
    { stiffness: 150, damping: 24, mass: 0.35 },
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x =
        VIEWBOX_X + ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
      const y =
        VIEWBOX_Y + ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;

      pointerX.set(x);
      pointerY.set(y);
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [pointerX, pointerY]);

  return (
    <main className="flex min-h-svh w-full items-center justify-center overflow-hidden bg-black">
      <div className="flex h-full w-full flex-1 items-center justify-center px-6 py-10">
        <svg
          ref={svgRef}
          aria-label="DocWise logo animation demo"
          fill="none"
          viewBox={`${VIEWBOX_X} ${VIEWBOX_Y} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
          className="h-auto w-full max-w-[30rem]"
        >
          <defs>
            <motion.radialGradient
              cx={gradientCx}
              cy={gradientCy}
              gradientUnits="userSpaceOnUse"
              id="docwiseHeroHighlight"
              r={GRADIENT_RADIUS}
            >
              <stop stopColor="var(--color-sky-500)" />
              <stop
                offset="1"
                stopColor="var(--color-sky-500)"
                stopOpacity="0"
              />
            </motion.radialGradient>
          </defs>
          <path
            d={DOCWISE_LOGO_PATH}
            fill="white"
            fillRule="evenodd"
            stroke="var(--color-neutral-600)"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d={DOCWISE_LOGO_PATH}
            fill="#050505"
            fillRule="evenodd"
            stroke="url(#docwiseHeroHighlight)"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
      </div>
    </main>
  );
}
