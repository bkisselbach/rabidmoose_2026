import type { PriceRange } from '@/lib/priceIntent';
import { formatPriceRange } from '@/lib/priceIntent';
import { formatCurrency } from '@/lib/currency';

// Shared by the cart drawer's Consultant deck review (DeckCoverage.tsx) and the full /advisor
// page so the two surfaces can't drift on how "over budget" reads.
export function BudgetBar({ total, budget }: { total: number; budget: PriceRange }) {
  const overBudget = total > budget.end;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span>Cart vs. your budget</span>
        <span className={overBudget ? 'font-semibold text-destructive' : 'font-semibold text-foreground'}>
          {formatCurrency(total)} of {formatPriceRange(budget)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className={overBudget ? 'h-full rounded-full bg-destructive' : 'h-full rounded-full bg-primary'}
          style={{ width: `${Math.min(100, (total / Math.max(budget.end, 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
