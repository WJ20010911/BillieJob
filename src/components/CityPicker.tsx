"use client";

import { useState, useRef, useEffect } from "react";
import { PROVINCES } from "@/lib/cities";

interface CityPickerProps {
  value: string;
  onChange: (city: string) => void;
  className?: string;
  placeholder?: string;
  compact?: boolean;
}

export default function CityPicker({
  value,
  onChange,
  className = "",
  placeholder = "请选择城市",
  compact = false,
}: CityPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeProvince, setActiveProvince] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const currentProvince = PROVINCES.find((province) => province.cities.includes(value));

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleProvinceClick = (province: string) => {
    setActiveProvince((prev) => (prev === province ? "" : province));
  };

  const handleCitySelect = (city: string) => {
    onChange(city);
    setOpen(false);
    setActiveProvince("");
  };

  return (
    <div ref={ref} className={"relative " + className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          compact
            ? "flex h-13 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-600 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:border-slate-300"
            : "flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-400"
        }
      >
        {compact ? (
          <>
            <span>{value || "全国"}</span>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <>
            <span className={value ? "text-gray-900" : "text-gray-400"}>
              {value ? (currentProvince?.name || "") + " · " + value : placeholder}
            </span>
            <svg className="ml-2 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 flex w-[480px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <div className="max-h-72 w-32 shrink-0 overflow-y-auto rounded-l-2xl border-r border-slate-100 bg-slate-50">
            {compact && (
              <button
                type="button"
                onClick={() => handleCitySelect("")}
                className={
                  "w-full px-3 py-2.5 text-left text-sm transition-colors " +
                  (!value ? "bg-white font-medium text-slate-900" : "text-slate-500 hover:bg-slate-100")
                }
              >
                全国
              </button>
            )}
            {PROVINCES.map((province) => (
              <button
                key={province.name}
                type="button"
                onClick={() => handleProvinceClick(province.name)}
                className={
                  "w-full px-3 py-2.5 text-left text-sm transition-colors " +
                  (activeProvince === province.name
                    ? "bg-white font-medium text-slate-900"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                {province.name}
              </button>
            ))}
          </div>

          <div className="max-h-72 flex-1 overflow-y-auto p-2">
            {activeProvince ? (
              <div className="grid grid-cols-2 gap-1">
                {PROVINCES.find((province) => province.name === activeProvince)?.cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={
                      "rounded-lg px-3 py-2.5 text-left text-sm transition-colors " +
                      (value === city
                        ? "bg-slate-100 font-medium text-slate-900"
                        : "text-slate-700 hover:bg-slate-50")
                    }
                  >
                    {city}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                先选省份
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
