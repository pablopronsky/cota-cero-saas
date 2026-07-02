"use client";

import { useMemo, useState } from "react";
import { normalizar } from "@/lib/reglas/normalizar";
import { Input } from "@/components/ui/input";

interface Props<T> {
  items: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Autocomplete simple: filtra localmente por nombre normalizado, sin dependencias extra. */
export function Autocomplete<T>({
  items,
  getLabel,
  getSubLabel,
  getKey,
  onSelect,
  placeholder,
  disabled,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtrados = useMemo(() => {
    const termino = normalizar(query.trim());
    if (!termino) return items.slice(0, 20);
    return items
      .filter(
        (i) =>
          normalizar(getLabel(i)).includes(termino) ||
          (getSubLabel && normalizar(getSubLabel(i)).includes(termino)),
      )
      .slice(0, 20);
  }, [items, query, getLabel, getSubLabel]);

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtrados.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-card shadow-md">
          {filtrados.map((item) => (
            <button
              key={getKey(item)}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(item);
                setQuery("");
                setOpen(false);
              }}
            >
              <div>{getLabel(item)}</div>
              {getSubLabel && (
                <div className="text-xs text-muted-foreground">{getSubLabel(item)}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
