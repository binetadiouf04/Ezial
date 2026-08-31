export interface PaymentMethod {
  id: string;
  label: string;
  description: string;
}

// Canonical list & order of payment methods accepted by Ezial (prototype —
// all are simulated, no real payment is processed). Wave and Orange Money
// are the primary mobile money methods; PayPal is a complementary option.
export const paymentMethods: PaymentMethod[] = [
  { id: 'wave', label: 'Wave', description: 'Paiement mobile' },
  { id: 'orange', label: 'Orange Money', description: 'Paiement mobile' },
  { id: 'paypal', label: 'PayPal', description: 'Paiement en ligne' },
];

export const paymentLabels: Record<string, string> = paymentMethods.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.label }),
  {} as Record<string, string>,
);
