import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { getCustomColorBadgeStyle, normalizeHexColor } from '../utils/colors';

export interface ColoredSelectOption {
  value: string;
  label: string;
  colorHex?: string;
  badgeClass?: string;
}

interface ColoredSelectProps {
  value: string;
  options: ColoredSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuWidthClass?: string;
  size?: 'xs' | 'sm';
  ariaLabel?: string;
  stopPropagation?: boolean;
}

export const ColoredSelect: React.FC<ColoredSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = '-- اختر --',
  disabled = false,
  className = '',
  menuWidthClass = 'min-w-[175px]',
  size = 'sm',
  ariaLabel,
  stopPropagation = false
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const minW = Math.max(rect.width, 175);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const estimatedMenuH = Math.min(260, options.length * 36 + 18);

    const openUpward = rect.bottom + estimatedMenuH + 8 > viewportH && rect.top > estimatedMenuH + 12;
    let left = rect.left;
    if (left + minW > viewportW - 8) {
      left = Math.max(8, rect.right - minW);
    }
    if (left < 8) left = 8;

    setMenuStyle({
      position: 'fixed',
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? viewportH - rect.top + 4 : undefined,
      left,
      minWidth: minW,
      maxWidth: Math.min(320, viewportW - 16),
      zIndex: 9999
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => updateMenuPosition();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updateMenuPosition]);

  const selectedOption = options.find(o => o.value === value);
  const selectedHex = normalizeHexColor(selectedOption?.colorHex);
  const selectedStyle = selectedHex ? getCustomColorBadgeStyle(selectedHex) : undefined;

  const sizeClasses =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 rounded-lg gap-1'
      : 'text-xs px-3 py-1.5 rounded-xl gap-2';

  const menuContent = open ? (
    <div
      ref={menuRef}
      dir="rtl"
      data-no-drag="true"
      style={menuStyle}
      onClick={e => {
        if (stopPropagation) e.stopPropagation();
      }}
      onPointerDown={e => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={`${menuWidthClass} max-h-60 overflow-y-auto bg-white border border-[#d6e5e8] rounded-2xl shadow-2xl p-1.5 space-y-1`}
    >
      {options.map(opt => {
        const isSelected = opt.value === value;
        const optHex = normalizeHexColor(opt.colorHex);
        const optStyle = optHex ? getCustomColorBadgeStyle(optHex) : undefined;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={e => {
              if (stopPropagation) e.stopPropagation();
              onChange(opt.value);
              setOpen(false);
            }}
            style={optStyle}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-right ${
              optStyle
                ? ''
                : opt.badgeClass
                ? `${opt.badgeClass} border-transparent`
                : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100'
            } ${isSelected ? 'ring-2 ring-[#087e83]/45 shadow-2xs' : 'hover:opacity-90'}`}
          >
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              {optHex && (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: optHex }}
                />
              )}
              <span className="truncate">{opt.label}</span>
            </span>
            {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      data-no-drag="true"
      onClick={e => {
        if (stopPropagation) e.stopPropagation();
      }}
      onPointerDown={e => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={`relative inline-block ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={e => {
          if (stopPropagation) e.stopPropagation();
          if (!disabled) setOpen(prev => !prev);
        }}
        style={selectedStyle}
        className={`w-full flex items-center justify-between font-bold border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${
          selectedStyle
            ? ''
            : selectedOption?.badgeClass
            ? `${selectedOption.badgeClass} border-black/10`
            : 'bg-white text-slate-700 border-[#bfe2db] hover:border-[#087e83]'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedHex && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedHex }}
            />
          )}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 opacity-75 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {menuContent && typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent}
    </div>
  );
};
