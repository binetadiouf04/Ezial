import type { Order } from '@/store/AppContext';
import OrangeMoneyPayment from './OrangeMoneyPayment';
import WavePayment from './WavePayment';

// Paiement en ligne d'une commande : l'écran du moyen choisi à la commande (Wave ou Orange Money).
export default function OnlinePayment(props: { order: Order; autoStart?: boolean; autoOpen?: boolean }) {
  return props.order.payment === 'wave' ? <WavePayment {...props} /> : <OrangeMoneyPayment {...props} />;
}
