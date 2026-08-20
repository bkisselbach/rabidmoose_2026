import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import { ChangeEvent, useState, useEffect } from "react";

interface QuantityInputBasicProps {
  quantity: number;
  min?: number;
  max?: number | null;
  step?: number;
  disabled?: boolean;
  onChange: (quantity: number) => void;
  className?: string;
}

const QuantityInputBasic = ({
  className,
  disabled = false,
  max = null,
  min = 1,
  onChange,
  quantity,
  step = 1,
}: QuantityInputBasicProps) => {
  const [inputValue, setInputValue] = useState(quantity.toString());

  useEffect(() => {
    setInputValue(quantity.toString());
  }, [quantity]);

  const handleDecrease = () => {
    if (quantity - step >= min) {
      onChange(quantity - step);
    }
  };

  const handleIncrease = () => {
    if (max === null || quantity + step <= max) {
      onChange(quantity + step);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);

    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= min && (max === null || value <= max)) {
      onChange(value);
    }
  };

  const handleBlur = () => {
    const value = parseInt(inputValue);
    if (isNaN(value)) {
      // Revert to last known quantity on unparseable input, don't clamp to min: callers use
      // min={0}, and clamping would silently delete the cart line on a stray blur.
      setInputValue(quantity.toString());
      return;
    }
    if (value < min) {
      setInputValue(min.toString());
      onChange(min);
    } else if (max !== null && value > max) {
      setInputValue(max.toString());
      onChange(max);
    } else {
      setInputValue(value.toString());
      onChange(value);
    }
  };

  return (
    <div
      className={cn(
        // Was the registry's stock `rounded-lg shadow-xs shadow-black/5` (2026-08-18, CSS/theming
        // audit): a third elevation the app's two-level system doesn't have, and the panel radius
        // on what is a CONTROL. `rounded-md` + `shadow-rest` puts it on the same footing as Button
        // and Input, which is what it sits beside in the cart.
        "inline-flex cursor-pointer rounded-md shadow-rest",
        className
      )}
    >
      <button
        className={cn(
          'pressable',
          "hover:bg-muted flex cursor-pointer items-center justify-center rounded-s-md border px-3 py-1 focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-50",
          disabled && "pointer-events-none"
        )}
        onClick={handleDecrease}
        disabled={disabled || quantity <= min}
        aria-label="Decrease quantity"
      >
        <Minus size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="w-12 border-y bg-transparent px-2 py-1 text-center text-sm font-semibold text-foreground outline-none"
        min={min}
        max={max !== null ? max : undefined}
        disabled={disabled}
        aria-label="Quantity"
      />
      <button
        className={cn(
          'pressable',
          "hover:bg-muted flex cursor-pointer items-center justify-center rounded-e-md border px-3 py-1 focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-50",
          disabled && "pointer-events-none"
        )}
        onClick={handleIncrease}
        disabled={disabled || (max !== null && quantity >= max)}
        aria-label="Increase quantity"
      >
        <Plus size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
};

export default QuantityInputBasic;
