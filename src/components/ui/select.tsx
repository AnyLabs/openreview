import { useState, useRef, useEffect, useCallback, useId, useMemo } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showCheckmark?: boolean;
  emptyText?: string;
}

type DropdownPosition = "bottom" | "top";

interface DropdownStyle {
  top: number;
  left: number;
  width: number;
}

const DROPDOWN_GAP = 4;
const DROPDOWN_MAX_HEIGHT = 320;

function getDropdownLayout(element: HTMLDivElement): {
  position: DropdownPosition;
  style: DropdownStyle;
} {
  const rect = element.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const dropdownHeight = DROPDOWN_MAX_HEIGHT;
  const shouldPlaceTop = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
  const position: DropdownPosition = shouldPlaceTop ? "top" : "bottom";

  const top = shouldPlaceTop
    ? Math.max(8, rect.top - dropdownHeight - DROPDOWN_GAP)
    : rect.bottom + DROPDOWN_GAP;
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const left = Math.min(Math.max(8, rect.left), maxLeft);

  return {
    position,
    style: {
      top,
      left,
      width: rect.width,
    },
  };
}

function getDropdownLayoutWithHeight(
  element: HTMLDivElement,
  dropdownHeight: number
): {
  position: DropdownPosition;
  style: DropdownStyle;
} {
  const rect = element.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const resolvedHeight = Math.min(dropdownHeight || DROPDOWN_MAX_HEIGHT, DROPDOWN_MAX_HEIGHT);
  const shouldPlaceTop = spaceBelow < resolvedHeight && spaceAbove > spaceBelow;
  const position: DropdownPosition = shouldPlaceTop ? "top" : "bottom";
  const top = shouldPlaceTop
    ? Math.max(8, rect.top - resolvedHeight - DROPDOWN_GAP)
    : rect.bottom + DROPDOWN_GAP;
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const left = Math.min(Math.max(8, rect.left), maxLeft);

  return {
    position,
    style: {
      top,
      left,
      width: rect.width,
    },
  };
}

export function Select({
  options,
  value,
  placeholder = "请选择...",
  searchPlaceholder = "搜索...",
  onChange,
  disabled = false,
  className = "",
  showCheckmark = true,
  emptyText = "无匹配选项",
}: SelectProps) {
  const selectId = useId();
  const listboxId = `select-listbox-${selectId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>("bottom");
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      option.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedOptions = filteredOptions.reduce<Record<string, SelectOption[]>>(
    (acc, option) => {
      const group = option.group || "";
      if (!acc[group]) acc[group] = [];
      acc[group].push(option);
      return acc;
    },
    {}
  );
  const flatOptions = useMemo(
    () => filteredOptions.map((option, index) => ({ option, index })),
    [filteredOptions]
  );
  const getOptionIndex = useCallback(
    (optionValue: string) => flatOptions.findIndex(({ option }) => option.value === optionValue),
    [flatOptions]
  );

  const updateDropdownLayout = useCallback(() => {
    if (!containerRef.current) return;
    const layout = getDropdownLayout(containerRef.current);
    setDropdownPosition(layout.position);
    setDropdownStyle(layout.style);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInTrigger = containerRef.current?.contains(target);
      const isInDropdown = dropdownRef.current?.contains(target);
      if (!isInTrigger && !isInDropdown) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateDropdownLayout();
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [isOpen, updateDropdownLayout]);

  useEffect(() => {
    if (!isOpen || !containerRef.current || !dropdownRef.current) return;

    const measuredHeight = dropdownRef.current.offsetHeight;
    const layout = getDropdownLayoutWithHeight(containerRef.current, measuredHeight);
    setDropdownPosition(layout.position);
    setDropdownStyle(layout.style);
  }, [isOpen, searchQuery, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = flatOptions.findIndex(({ option }) => option.value === value);
    const fallbackIndex = flatOptions.findIndex(({ option }) => !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallbackIndex);
  }, [isOpen, flatOptions, value]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const activeItem = dropdownRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`
    );
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (isOpen) updateDropdownLayout();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen, updateDropdownLayout]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery("");
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = flatOptions.findIndex(
        ({ option }, idx) => idx > activeIndex && !option.disabled
      );
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      let prevIndex = -1;
      for (let i = activeIndex - 1; i >= 0; i -= 1) {
        if (!flatOptions[i].option.disabled) {
          prevIndex = i;
          break;
        }
      }
      if (prevIndex >= 0) {
        setActiveIndex(prevIndex);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const activeOption = flatOptions[activeIndex]?.option;
      if (activeOption && !activeOption.disabled) {
        handleSelect(activeOption.value);
      }
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    const next = !isOpen;
    setIsOpen(next);
    if (next) updateDropdownLayout();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        updateDropdownLayout();
      }
    }
  };

  const dropdown = isOpen && dropdownStyle
    ? createPortal(
        <div
          ref={dropdownRef}
          className={`searchable-select-dropdown ${
            dropdownPosition === "top" ? "is-top" : ""
          }`}
          id={listboxId}
          role="listbox"
          style={{
            position: "fixed",
            top: `${dropdownStyle.top}px`,
            left: `${dropdownStyle.left}px`,
            width: `${dropdownStyle.width}px`,
          }}
        >
          <div className="searchable-select-search">
            <svg
              className="searchable-select-search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="searchable-select-search-input"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={
                activeIndex >= 0 ? `select-option-${selectId}-${activeIndex}` : undefined
              }
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {searchQuery && (
              <button
                type="button"
                className="searchable-select-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="searchable-select-options">
            {filteredOptions.length === 0 ? (
              <div className="searchable-select-empty">{emptyText}</div>
            ) : (
              Object.entries(groupedOptions).map(([group, groupItems]) => (
                <div
                  key={group || "default"}
                  className="searchable-select-group"
                >
                  {group && <div className="searchable-select-group-label">{group}</div>}

                  {groupItems.map((option) => {
                    const optionIndex = getOptionIndex(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`searchable-select-option ${
                          option.value === value ? "is-selected" : ""
                        } ${optionIndex === activeIndex ? "is-focused" : ""} ${
                          option.disabled ? "is-disabled" : ""
                        }`}
                        id={`select-option-${selectId}-${optionIndex}`}
                        role="option"
                        aria-selected={option.value === value}
                        data-option-index={optionIndex}
                        onClick={() => !option.disabled && handleSelect(option.value)}
                        onMouseEnter={() => !option.disabled && setActiveIndex(optionIndex)}
                        disabled={option.disabled}
                      >
                        {showCheckmark && (
                          <span className="searchable-select-option-check">
                            {option.value === value && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                        )}

                        {option.icon && (
                          <span className="searchable-select-option-icon">{option.icon}</span>
                        )}

                        <span className="searchable-select-option-content">
                          <span className="searchable-select-option-label">{option.label}</span>
                          {option.description && (
                            <span className="searchable-select-option-description">
                              {option.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={containerRef}
        className={`searchable-select ${isOpen ? "is-open" : ""} ${
          disabled ? "is-disabled" : ""
        } ${className}`}
      >
        <button
          type="button"
          className="searchable-select-trigger"
          onClick={handleToggle}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
        >
          <span className="searchable-select-trigger-content">
            {selectedOption?.icon && (
              <span className="searchable-select-trigger-icon">{selectedOption.icon}</span>
            )}
            <span
              className={`searchable-select-trigger-label ${
                !selectedOption ? "is-placeholder" : ""
              }`}
            >
              {selectedOption?.label || placeholder}
            </span>
            {selectedOption?.description && (
              <span className="searchable-select-trigger-description">
                {selectedOption.description}
              </span>
            )}
          </span>
          <svg
            className="searchable-select-trigger-arrow"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {dropdown}
    </>
  );
}
