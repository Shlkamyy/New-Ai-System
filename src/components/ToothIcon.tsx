import React from 'react';

interface ToothIconProps {
  /** Palmer tooth number 1..8 (1 = central incisor, 3 = canine, 4-5 = premolars, 6-8 = molars) */
  num: number;
  /** 'upper' = maxillary (roots point UP, crown points DOWN); 'lower' = mandibular (crown points UP, roots point DOWN) */
  arch: 'upper' | 'lower';
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'quadrant';
}

export const ToothIcon: React.FC<ToothIconProps> = ({
  num,
  arch,
  selected = false,
  disabled = false,
  onClick,
  title,
  size = 'md'
}) => {
  const isLower = arch === 'lower';

  // ViewBox is 36x64 in "upper tooth" orientation (roots at top y=2..25, elongated crown at bottom y=25..61).
  // For lower arch we flip vertically via SVG transform="translate(0,64) scale(1,-1)".
  // Text label stays unflipped and centered on the crown area (upper crown center ~y=43, lower crown center ~y=21).
  const renderAnatomyPaths = () => {
    // Incisors (1 = Central, 2 = Lateral)
    if (num === 1 || num === 2) {
      const w = num === 1 ? 1 : 0.9;
      return (
        <g transform={w !== 1 ? 'translate(1.8,0) scale(0.9,1)' : undefined}>
          {/* Single tapered root + elongated incisor crown */}
          <path
            d="M18 3 C16.3 3, 15.1 13, 14.2 25 C12.2 27.8, 10.2 33, 10.2 44.5 C10.2 55.2, 12.2 60.5, 18 60.5 C23.8 60.5, 25.8 55.2, 25.8 44.5 C25.8 33, 23.8 27.8, 21.8 25 C20.9 13, 19.7 3, 18 3 Z"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          {/* Cervical neck line */}
          <path
            d="M13 26.8 Q18 24.2 23 26.8"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
      );
    }

    // Canine (3) — longer pointed root & elongated cusped crown
    if (num === 3) {
      return (
        <g>
          <path
            d="M18 1.5 C16.1 1.5, 14.8 12.5, 13.7 25 C11.2 28.5, 9.6 34.5, 10.2 44.5 C10.9 54, 14.6 61.8, 18 62.2 C21.4 61.8, 25.1 54, 25.8 44.5 C26.4 34.5, 24.8 28.5, 22.3 25 C21.2 12.5, 19.9 1.5, 18 1.5 Z"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M12.8 26.8 Q18 24 23.2 26.8"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
      );
    }

    // Premolars (4, 5) — broader elongated bicuspid crown, bifurcated / grooved root hint
    if (num === 4 || num === 5) {
      return (
        <g>
          <path
            d="M14.2 3.5 C12.8 3.5, 12.2 14, 12.5 25.2 C9.4 28.8, 8.2 35.5, 8.8 45.5 C9.4 55, 12.6 60.2, 15.6 60.2 C16.9 60.2, 17.4 58.6, 18 58.6 C18.6 58.6, 19.1 60.2, 20.4 60.2 C23.4 60.2, 26.6 55, 27.2 45.5 C27.8 35.5, 26.6 28.8, 23.5 25.2 C23.8 14, 23.2 3.5, 21.8 3.5 C20.4 3.5, 19.4 13, 18 18.5 C16.6 13, 15.6 3.5, 14.2 3.5 Z"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M11.4 27 Q18 24.4 24.6 27"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
      );
    }

    // Molars (6, 7, 8) — wide elongated multi-cusp crown with 2/3 distinct roots
    const scaleX = num === 8 ? 0.92 : num === 7 ? 0.97 : 1;
    const tx = num === 8 ? 1.4 : num === 7 ? 0.55 : 0;
    return (
      <g transform={scaleX !== 1 ? `translate(${tx},0) scale(${scaleX},1)` : undefined}>
        <path
          d="M11 3.5 C9.3 3.5, 8.5 14, 9.6 25.5 C6.6 29, 5 36.2, 5.8 46.5 C6.6 56, 10.2 60.5, 13.8 60.5 C15.6 60.5, 16.8 59, 18 59 C19.2 59, 20.4 60.5, 22.2 60.5 C25.8 60.5, 29.4 56, 30.2 46.5 C31 36.2, 29.4 29, 26.4 25.5 C27.5 14, 26.7 3.5, 25 3.5 C23.4 3.5, 22.2 13.8, 20.6 20.8 C19.9 14, 19.2 5.8, 18 5.8 C16.8 5.8, 16.1 14, 15.4 20.8 C13.8 13.8, 12.6 3.5, 11 3.5 Z"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 27.2 Q18 24.5 27 27.2"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity={0.55}
        />
      </g>
    );
  };

  const sizeClass =
    size === 'quadrant'
      ? 'w-full aspect-[36/64] max-w-[38px]'
      : size === 'sm'
      ? 'w-7 h-12 sm:w-8 sm:h-14'
      : 'w-8 h-14 sm:w-9 sm:h-16';

  const crownTextY = isLower ? 21 : 43;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`group relative ${sizeClass} flex flex-col items-center justify-center rounded-xl transition-all select-none ${
        selected
          ? 'scale-105 drop-shadow-sm'
          : 'hover:scale-105'
      } ${disabled ? 'cursor-default opacity-85' : 'cursor-pointer active:scale-95'}`}
    >
      <svg
        viewBox="0 0 36 64"
        className={`w-full h-full overflow-visible transition-colors ${
          selected
            ? 'fill-[#087e83] stroke-[#065f63] text-white'
            : 'fill-white dark:fill-[#1b2c39] stroke-slate-400 dark:stroke-slate-500 group-hover:fill-[#e7f5f2] group-hover:stroke-[#087e83] text-slate-700 dark:text-slate-100'
        }`}
      >
        <g transform={isLower ? 'translate(0,64) scale(1,-1)' : undefined}>
          {renderAnatomyPaths()}
        </g>
        <text
          x="18"
          y={crownTextY}
          textAnchor="middle"
          dominantBaseline="central"
          className={`font-mono font-extrabold text-[13px] stroke-none pointer-events-none ${
            selected
              ? 'fill-white'
              : 'fill-slate-700 dark:fill-slate-100 group-hover:fill-[#087e83]'
          }`}
        >
          {num}
        </text>
      </svg>
    </button>
  );
};
