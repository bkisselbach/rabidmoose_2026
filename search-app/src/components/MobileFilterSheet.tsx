import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';

export function MobileFilterSheet({
  title,
  activeCount = 0,
  children,
}: {
  title: string;
  /** Selected facet values across the sheet's facets -- badged on the trigger so applied filters
   *  stay visible while the sheet is closed (on /search this button is the only applied-filter
   *  signal on small screens; the chips row is gone there as of 2026-08-17). */
  activeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-2xs font-bold leading-4 text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="sheet-panel-left">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-5 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
