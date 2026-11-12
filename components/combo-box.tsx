"use client";
import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A text field that suggests options as the student types and only offers values from `options`.
 * Typing filters the list (names starting with the text first); arrows move, Enter or a click picks,
 * Escape closes. The form validates that the final value is one of the options.
 */
export function ComboBox({
  id,
  value,
  options,
  onChange,
  placeholder,
  invalid,
  describedBy,
  required,
}: {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [...options];
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const contains = options.filter(
      (o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q),
    );
    return [...starts, ...contains];
  }, [value, options]);
  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
  };
  const move = (to: number) => {
    setActive(to);
    list.current?.children[to]?.scrollIntoView({ block: "nearest" });
  };
  const shown = open && matches.length > 0;
  return (
    <div className="combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? listId + "-" + active : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        // A click on an option lands before blur closes the list (onMouseDown below).
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else move(Math.min(active + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(Math.max(active - 1, 0));
          } else if (e.key === "Enter" && shown) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      <ChevronDown className="combo-icon" size={16} aria-hidden />
      <ul
        id={listId}
        ref={list}
        role="listbox"
        className="combo-list"
        hidden={!shown}
      >
        {shown &&
          matches.map((o, i) => (
            <li
              key={o}
              id={listId + "-" + i}
              role="option"
              aria-selected={i === active}
              className={o === value ? "chosen" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseMove={() => setActive(i)}
            >
              {o}
            </li>
          ))}
      </ul>
    </div>
  );
}
