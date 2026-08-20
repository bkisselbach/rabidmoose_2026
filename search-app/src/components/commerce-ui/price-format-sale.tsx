import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

interface PriceFormat_SaleProps extends React.HTMLAttributes<HTMLDivElement> {
  originalPrice: number;
  salePrice?: number;
  showSavePercentage?: boolean;
  classNameOriginalPrice?: string;
  classNameSalePrice?: string;
  classNameSalePercentage?: string;
}

const PriceFormat_Sale: React.FC<PriceFormat_SaleProps> = ({
  className,
  classNameOriginalPrice,
  classNameSalePercentage,
  classNameSalePrice,
  originalPrice,
  salePrice,
  showSavePercentage = false,
}) => {
  const isSale = salePrice !== undefined && salePrice < originalPrice;
  const savePercentage = isSale
    ? ((originalPrice - salePrice) / originalPrice) * 100
    : 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {isSale ? (
        <>
          <span
            className={cn(
              "font-medium text-muted-foreground line-through",
              classNameOriginalPrice
            )}
          >
            {formatCurrency(originalPrice)}
          </span>
          <span
            className={cn(
              "text-[length:inherit] font-medium",
              classNameSalePrice
            )}
          >
            {formatCurrency(salePrice)}
          </span>
          {showSavePercentage && (
            <span
              className={cn(
                "rounded-sm bg-primary p-1 text-sm font-medium text-primary-foreground",
                classNameSalePercentage
              )}
            >
              Save {Math.round(savePercentage)}%
            </span>
          )}
        </>
      ) : (
        <span
          className={cn("text-[length:inherit] font-medium", classNameSalePrice)}
        >
          {formatCurrency(originalPrice)}
        </span>
      )}
    </div>
  );
};

export default PriceFormat_Sale;
