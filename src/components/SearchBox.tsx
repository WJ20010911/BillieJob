"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchSuggestion } from "@/types";
import CityPicker from "@/components/CityPicker";

export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string, cityFilter: string) => {
    if (q.trim().length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (cityFilter) params.set("city", cityFilter);
      const res = await fetch("/api/companies/search?" + params.toString());
      const data = await res.json();
      setSuggestions(data.companies || []);
      setShowDropdown((data.companies || []).length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value, city), 200);
  };

  const handleCityChange = (nextCity: string) => {
    setCity(nextCity);
    if (query.trim()) {
      search(query, nextCity);
    }
  };

  const handleSelect = (company: SearchSuggestion) => {
    setQuery(company.name);
    setShowDropdown(false);
    const url = city
      ? "/companies/" + company.id + "?city=" + encodeURIComponent(city)
      : "/companies/" + company.id;
    router.push(url);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (suggestions.length > 0) {
      const first = suggestions[0];
      const url = city
        ? "/companies/" + first.id + "?city=" + encodeURIComponent(city)
        : "/companies/" + first.id;
      router.push(url);
    } else if (query.trim()) {
      const params = new URLSearchParams({ q: query.trim() });
      if (city) params.set("city", city);
      router.push("/search?" + params.toString());
    }
    setShowDropdown(false);
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative mx-auto w-full max-w-2xl">
      <div className="relative flex gap-2">
        <CityPicker value={city} onChange={handleCityChange} compact />

        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="搜索公司名称"
            className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-5 pr-12 text-base text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)] outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:bg-white"
            autoComplete="off"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 transition hover:text-slate-900"
            aria-label="搜索"
          >
            {loading ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
        >
          {suggestions.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => handleSelect(company)}
              className="w-full px-5 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{company.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {company.cities && company.cities.length > 0
                      ? company.cities.slice(0, 3).join(" · ") + (company.cities.length > 3 ? " · · ·" : "")
                      : company.alias || ""}
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <div className="text-sm font-semibold text-slate-900">{company.score}</div>
                  <div className="text-xs text-slate-400">{company.recordCount} 条</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
