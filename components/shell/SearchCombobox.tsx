"use client";
// Tier: build. Use-when: the header search, once per page. Avoid-when: admin search fields.
// Reduced-motion: the panel appears without its 8 px slide. Touch: every option at least 48 px tall.
// SearchCombobox (W3C APG combobox with listbox popup; docs/REDESIGN-BUILD-PLAN.md §6): the input
// stays inside a plain GET form to /search, so search works before and without JavaScript. Typing
// asks /api/search/suggest after 150 ms; a newer request aborts the older one and a counter drops
// any late answer. Search history lives in this browser only: at most 8, no duplicates, no empty
// entries, each removable, all clearable; when storage is blocked there is simply no history.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Suggestions } from "@/app/api/search/suggest/route";
import { notifyStored, useStoredString } from "@/components/shell/use-browser-state";

const HISTORY_KEY = "hb-search-history";
const HISTORY_MAX = 8;

export function parseHistory(raw: string | null): string[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export function readHistory(): string[] {
  try {
    return parseHistory(window.localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

function writeHistory(list: string[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(HISTORY_KEY);
    else window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    // Storage unavailable: no history, search still works.
  }
  notifyStored();
}

export function rememberSearch(q: string, list: string[] = readHistory()): string[] {
  const term = q.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!term) return list;
  const next = [term, ...list.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, HISTORY_MAX);
  writeHistory(next);
  return next;
}

export interface SearchLabels {
  label: string;
  placeholder: string;
  submit: string;
  clear: string;
  suggestions: string;
  products: string;
  history: string;
  clearHistory: string;
  /** "{term}" is replaced. */
  removeHistory: string;
  category: string;
  from: string;
  /** "{count}" is replaced. */
  options: string;
  outOfStock: string;
  /** "{count}" is replaced (in the page's numerals). */
  count: string;
  none: string;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const digits = (n: number, locale: string) => (locale === "bn" ? String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!) : String(n));

type Option = { id: string; kind: "term" | "category" | "product" | "history"; href: string; text: string };

export function SearchCombobox({ action, locale, labels, initial = "", onEscapeEmpty }: { action: string; locale: string; labels: SearchLabels; initial?: string; onEscapeEmpty?: () => void }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions | null>(null);
  const rawHistory = useStoredString(HISTORY_KEY);
  const history = useMemo(() => parseHistory(rawHistory), [rawHistory]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<number>(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);


  const searchHref = (q: string) => `${action}?q=${encodeURIComponent(q)}`;
  const q = value.trim();
  const options: Option[] = q
    ? [
        ...(data?.q === q ? data.terms.map((t, i) => ({ id: `${uid}-t${i}`, kind: "term" as const, href: searchHref(t), text: t })) : []),
        ...(data?.q === q ? data.categories.map((c, i) => ({ id: `${uid}-c${i}`, kind: "category" as const, href: c.href, text: c.name })) : []),
        ...(data?.q === q ? data.products.map((p, i) => ({ id: `${uid}-p${i}`, kind: "product" as const, href: p.href, text: p.name })) : []),
      ]
    : history.map((h, i) => ({ id: `${uid}-h${i}`, kind: "history" as const, href: searchHref(h), text: h }));

  const fetchSuggestions = useCallback(
    (text: string) => {
      window.clearTimeout(timer.current);
      abort.current?.abort();
      const term = text.trim();
      if (!term) {
        setData(null);
        return;
      }
      timer.current = window.setTimeout(async () => {
        const mine = ++seq.current;
        const ctrl = new AbortController();
        abort.current = ctrl;
        try {
          const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}&l=${locale}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
          if (!res.ok) return; // 429 or an outage: keep whatever is shown, the form still submits.
          const body = (await res.json()) as Suggestions;
          if (mine !== seq.current) return; // a newer request has started
          setData(body);
          setActive(-1);
          const n = body.terms.length + body.categories.length + body.products.length;
          setStatus(n ? labels.count.replace("{count}", digits(n, locale)) : labels.none);
        } catch {
          // Aborted or offline: nothing to do.
        }
      }, 150);
    },
    [locale, labels],
  );

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  const go = (o: Option) => {
    if (o.kind === "term" || o.kind === "history") rememberSearch(o.text);
    setOpen(false);
    window.location.assign(o.href);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a + 1) % options.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a <= 0 ? options.length - 1 : a - 1) : -1));
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value) {
        e.preventDefault();
        setValue("");
        setData(null);
      } else if (onEscapeEmpty) {
        e.preventDefault();
        onEscapeEmpty();
      }
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      go(options[active]);
    }
  };

  const shown = open && (options.length > 0 || (q && data?.q === q));
  const products = data?.q === q ? data.products : [];
  const idx = (id: string) => options.findIndex((o) => o.id === id);
  const optionProps = (o: Option) => ({
    id: o.id,
    role: "option" as const,
    "aria-selected": options[active]?.id === o.id,
    className: "search-option",
    "data-kind": o.kind,
    onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
    onClick: () => go(o),
    onPointerEnter: () => setActive(idx(o.id)),
  });

  return (
    <div className="search-combobox" ref={root} data-open={shown ? "true" : undefined}>
      <label htmlFor="site-search" className="sr-only">
        {labels.label}
      </label>
      <input
        ref={input}
        id="site-search"
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={labels.placeholder}
        className="header-search-input"
        role="combobox"
        aria-expanded={shown ? "true" : "false"}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? options[active]?.id : undefined}
        value={value}
        maxLength={80}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {value ? (
        <button
          type="button"
          className="header-search-clear"
          onClick={() => {
            setValue("");
            setData(null);
            input.current?.focus();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">{labels.clear}</span>
        </button>
      ) : null}
      <button type="submit" className="header-search-submit" onClick={() => rememberSearch(value)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6L20 21l1-1-5.4-5.47A6.5 6.5 0 0 0 10.5 4z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="sr-only">{labels.submit}</span>
      </button>
      <div className="search-panel" hidden={!shown}>
        <ul id={listId} role="listbox" aria-label={labels.suggestions} className="search-list">
          {q ? (
            <>
              {options
                .filter((o) => o.kind === "term" || o.kind === "category")
                .map((o) => (
                  <li key={o.id} {...optionProps(o)}>
                    <span className="search-option-icon" aria-hidden="true" data-kind={o.kind} />
                    <span className="search-option-text">{o.text}</span>
                    {o.kind === "category" ? <span className="search-option-tag">{labels.category}</span> : null}
                  </li>
                ))}
              {products.length ? (
                <li role="presentation" className="search-group-label">
                  {labels.products}
                </li>
              ) : null}
              {options
                .filter((o) => o.kind === "product")
                .map((o, i) => {
                  const p = products[i]!;
                  return (
                    <li key={o.id} {...optionProps(o)}>
                      <span className="search-option-thumb" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a sized, format-optimised thumbnail. */}
                        {p.image ? <img src={p.image} alt="" width={48} height={48} loading="lazy" decoding="async" /> : null}
                      </span>
                      <span className="search-option-text">
                        {p.name}
                        <span className="search-option-meta">
                          {p.price}
                          {p.from ? ` ${labels.from}` : ""}
                          {p.options ? ` · ${labels.options.replace("{count}", p.options)}` : ""}
                          {p.inStock ? "" : ` · ${labels.outOfStock}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
            </>
          ) : (
            options.map((o) => (
              <li key={o.id} {...optionProps(o)}>
                <span className="search-option-icon" aria-hidden="true" data-kind="history" />
                <span className="search-option-text">{o.text}</span>
              </li>
            ))
          )}
        </ul>
        {!q && history.length ? (
          <div className="search-history-actions">
            <span className="search-group-label">{labels.history}</span>
            <span className="search-history-buttons">
              {history.map((h) => (
                <button key={h} type="button" className="search-history-remove" onClick={() => writeHistory(readHistory().filter((x) => x !== h))}>
                  <span className="sr-only">{labels.removeHistory.replace("{term}", h)}</span>
                  <span aria-hidden="true">{h} ×</span>
                </button>
              ))}
              <button type="button" className="search-history-clear" onClick={() => {
                writeHistory([]);
              }}>
                {labels.clearHistory}
              </button>
            </span>
          </div>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {open ? status : ""}
      </span>
    </div>
  );
}
