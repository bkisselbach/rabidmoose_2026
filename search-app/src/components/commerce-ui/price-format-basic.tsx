import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

interface PriceFormat_BasicProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

// Uses lib/currency.ts formatCurrency (Intl.NumberFormat), not react-number-format -- dropped that
// dependency 2026-08-14 as a redundant 56 kB formatter for the same USD output.
const PriceFormat_Basic: React.FC<PriceFormat_BasicProps> = ({
  className,
  value,
}) => {
  return (
    <span className={cn("text-lg font-medium", className)}>
      {formatCurrency(value)}
    </span>
  );
};

export default PriceFormat_Basic;
