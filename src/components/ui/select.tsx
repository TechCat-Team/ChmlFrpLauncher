import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "选择...",
  className = "",
  size = "default",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setIsOpen(false);
    setMenuStyle(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (selectRef.current && selectRef.current.contains(target)) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      closeMenu();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);
  const isSmall = size === "sm";

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const width = rect.width;
    let left = rect.left;
    if (left + width > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - width - 8);
    }
    let top = rect.bottom + 4;
    let maxHeight = Math.min(240, viewportHeight - rect.bottom - 8);

    if (menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      const availableBelow = viewportHeight - rect.bottom - 8;
      const availableAbove = rect.top - 8;
      const shouldOpenUp =
        availableBelow < menuHeight && availableAbove > availableBelow;
      if (shouldOpenUp) {
        top = Math.max(8, rect.top - menuHeight - 4);
        maxHeight = Math.min(240, availableAbove);
      } else {
        maxHeight = Math.min(240, availableBelow);
      }
    }

    setMenuStyle({
      top,
      left,
      width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const raf = requestAnimationFrame(updateMenuPosition);
    const handleResize = () => updateMenuPosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen]);

  return (
    <div ref={selectRef} className={`relative ${className}`}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          if (isOpen) {
            closeMenu();
          } else {
            setIsOpen(true);
          }
        }}
        className={`w-full ${
          isSmall ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
        } bg-card border border-border/60 rounded-lg text-left hover:border-foreground/20 transition-colors flex items-center justify-between`}
      >
        <span
          className={
            selectedOption ? "text-foreground" : "text-muted-foreground"
          }
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`${
            isSmall ? "w-3 h-3" : "w-4 h-4"
          } transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
            }}
            className="fixed z-[60] bg-card border border-border/60 rounded-lg shadow-lg overflow-auto pointer-events-auto"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange?.(option.value);
                  closeMenu();
                }}
                className={`w-full ${
                  isSmall ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
                } text-left hover:bg-foreground/5 transition-colors ${
                  option.value === value
                    ? "bg-foreground/10 text-foreground font-medium"
                    : "text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
