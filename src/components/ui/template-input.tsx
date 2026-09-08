import * as React from "react";
import { Input } from "@/components/ui/input";
import { TEMPLATE_VARS, activeVarQuery, applyVarSuggestion } from "@/lib/template-vars";
import { useT } from "@/i18n/useT";

export interface TemplateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export const TemplateInput = React.forwardRef<HTMLInputElement, TemplateInputProps>(
  ({ value, onChange, className, ...props }, forwardedRef) => {
    const t = useT();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const [queryInfo, setQueryInfo] = React.useState<{ start: number; query: string } | null>(null);
    const [activeIndex, setActiveIndex] = React.useState(0);

    const mergedRef = (node: HTMLInputElement) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const updateQuery = () => {
      if (!inputRef.current) return;
      const caret = inputRef.current.selectionStart || 0;
      const info = activeVarQuery(value, caret);
      // Arrow keys also fire keyup: resetting on every call would undo the move the keydown made.
      if (queryInfo && info && queryInfo.start === info.start && queryInfo.query === info.query) return;
      setQueryInfo(info);
      setActiveIndex(0);
    };

    React.useEffect(() => {
      updateQuery();
    }, [value]);

    const filteredVars = React.useMemo(() => {
      if (!queryInfo) return [];
      const q = queryInfo.query.toLowerCase();
      return TEMPLATE_VARS.filter(v => v.toLowerCase().startsWith(q));
    }, [queryInfo]);

    // The arrows move the highlight; without this the one they land on stays below the fold.
    React.useEffect(() => {
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    const acceptSuggestion = (name: string) => {
      if (!queryInfo || !inputRef.current) return;
      const caret = inputRef.current.selectionStart || 0;
      const { text, caret: newCaret } = applyVarSuggestion(value, queryInfo.start, caret, name);
      onChange(text);
      setQueryInfo(null);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCaret, newCaret);
        }
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!queryInfo || filteredVars.length === 0) {
        if (props.onKeyDown) props.onKeyDown(e);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filteredVars.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filteredVars.length) % filteredVars.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(filteredVars[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setQueryInfo(null);
      } else {
        if (props.onKeyDown) props.onKeyDown(e);
      }
    };

    return (
      <div className="relative">
        <Input
          ref={mergedRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Let the useEffect catch the value change to update query, 
            // or update it directly here after a tick so selectionStart is fresh
            setTimeout(updateQuery, 0);
          }}
          onKeyUp={updateQuery}
          onClick={updateQuery}
          onKeyDown={handleKeyDown}
          className={className}
          {...props}
        />
        {queryInfo && filteredVars.length > 0 && (
          <div ref={listRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
            {filteredVars.map((v, i) => (
              <div
                key={v}
                onClick={() => acceptSuggestion(v)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex items-baseline gap-2 px-2 py-1 text-xs cursor-pointer ${i === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
              >
                <span className="shrink-0 font-mono">{`{{${v}}}`}</span>
                {/* What the variable holds: the names alone say very little. */}
                <span className="truncate text-[11px] text-muted-foreground">{t(`templateVar.${v}`)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
)
TemplateInput.displayName = "TemplateInput";
