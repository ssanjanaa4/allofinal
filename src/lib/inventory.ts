export function getAvailableStock(totalStock: number, reservedStock: number) {
  return totalStock - reservedStock;
}
