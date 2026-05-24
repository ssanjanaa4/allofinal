import { Checkout } from "@/components/checkout";
import { ToastProvider } from "@/components/toast-provider";

export default function CheckoutPage() {
  return (
    <ToastProvider>
      <Checkout />
    </ToastProvider>
  );
}
