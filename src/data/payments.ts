export interface PaymentMethod {
  id: string;
  label: string;
  description: string;
}

// Canonical list & order of payment methods accepted by Ezial (prototype —
// all are simulated, no real payment is processed). Wave and Orange Money
// are the only two actually targeted for Ezial's market — PayPal was a
// placeholder "complementary option" never really intended for Dakar
// customers, so it's never offered as a real accepted method.
export const paymentMethods: PaymentMethod[] = [
  { id: 'wave', label: 'Wave', description: 'Paiement mobile' },
  { id: 'orange', label: 'Orange Money', description: 'Paiement mobile' },
];

export const paymentLabels: Record<string, string> = paymentMethods.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.label }),
  {} as Record<string, string>,
);
