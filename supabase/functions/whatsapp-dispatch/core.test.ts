// Tests du cœur du service d'envoi WhatsApp — aucun appel réseau.
// Lancer : node --test supabase/functions/whatsapp-dispatch/core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DisabledProvider,
  TestProvider,
  createProviderFromEnv,
  dispatchBatch,
  formatFcfa,
  formatQuantity,
  maskPhone,
  redactPhones,
  renderMessage,
  templateIdsFromEnv,
} from './core.ts';
import type { ClaimedJob, DispatchDb, MessageContext, Outcome, SendResult, TemplateIds, WhatsAppMessage, WhatsAppProvider } from './core.ts';

// Numéros fictifs (format valide, jamais contactés : aucun appel réseau).
const BUYER_PHONE = '+221770000001';
const SELLER_PHONE = '+221780000002';

const NO_TEMPLATES: TemplateIds = {
  buyer_order_confirmed: null,
  buyer_out_for_delivery: null,
  seller_new_order: null,
  seller_order_reminder: null,
};

interface Completion { id: string; outcome: Outcome; provider: string | null; providerMessageId: string | null; error: string | null }

class FakeDb implements DispatchDb {
  jobs: ClaimedJob[];
  contexts: Record<string, MessageContext>;
  claimCalls = 0;
  completions: Completion[] = [];
  dispatches: { provider: string; ready: boolean; error: string | null }[] = [];

  constructor(jobs: ClaimedJob[] = [], contexts: Record<string, MessageContext> = {}) {
    this.jobs = jobs;
    this.contexts = contexts;
  }

  claimBatch(limit: number): Promise<ClaimedJob[]> {
    this.claimCalls += 1;
    return Promise.resolve(this.jobs.slice(0, limit));
  }

  messageContext(id: string): Promise<MessageContext> {
    return Promise.resolve(this.contexts[id] ?? { relevant: false, reason: 'not_found' });
  }

  complete(id: string, outcome: Outcome, provider: string | null, providerMessageId: string | null, error: string | null): Promise<string> {
    this.completions.push({ id, outcome, provider, providerMessageId, error });
    return Promise.resolve(outcome);
  }

  recordDispatch(provider: string, ready: boolean, error: string | null): Promise<void> {
    this.dispatches.push({ provider, ready, error });
    return Promise.resolve();
  }
}

const logs: string[] = [];
const opts = { log: (line: string) => { logs.push(line); } };

function sellerJob(id = 'job-seller'): { job: ClaimedJob; ctx: MessageContext } {
  return {
    job: { id, kind: 'seller_new_order', attempts: 1, recipient_masked: maskPhone(SELLER_PHONE) },
    ctx: {
      relevant: true,
      kind: 'seller_new_order',
      to: SELLER_PHONE,
      params: { orderNumber: 'EZ-1001', link: 'https://ezial.net/pro/seller/commandes/os-1' },
    },
  };
}

test('fournisseur désactivé : aucune réservation, état « non prêt » enregistré', async () => {
  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  const provider = createProviderFromEnv({});
  assert.ok(provider instanceof DisabledProvider);
  assert.equal(provider.name, 'aucun');

  const summary = await dispatchBatch(db, provider, NO_TEMPLATES, opts);

  assert.equal(db.claimCalls, 0);
  assert.equal(db.completions.length, 0);
  assert.deepEqual(db.dispatches, [{ provider: 'aucun', ready: false, error: 'Aucun fournisseur WhatsApp configuré.' }]);
  assert.deepEqual(
    { claimed: summary.claimed, sent: summary.sent, retried: summary.retried, failed: summary.failed, skipped: summary.skipped },
    { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 },
  );
  assert.equal(summary.ready, false);
});

test('« aucun » et valeur vide donnent le fournisseur désactivé', () => {
  for (const v of ['', '  ', 'aucun', 'AUCUN', undefined]) {
    const p = createProviderFromEnv({ WHATSAPP_PROVIDER: v });
    assert.equal(p.name, 'aucun');
    assert.equal(p.isReady().ready, false);
  }
});

test('DisabledProvider.send refuse toujours (réessai, jamais d\'envoi)', async () => {
  const disabled: WhatsAppProvider = new DisabledProvider();
  const r = await disabled.send({ to: BUYER_PHONE, kind: 'seller_new_order', templateId: null, params: [], text: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.retryable, true);
});

test('fournisseur non pris en charge : reste désactivé, rien n\'est réservé', async () => {
  const provider = createProviderFromEnv({ WHATSAPP_PROVIDER: 'fournisseur-x' });
  assert.ok(provider instanceof DisabledProvider);
  const ready = provider.isReady();
  assert.equal(ready.ready, false);
  assert.equal(ready.reason, 'Fournisseur « fournisseur-x » non pris en charge : son adaptateur doit être ajouté.');

  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  await dispatchBatch(db, provider, NO_TEMPLATES, opts);
  assert.equal(db.claimCalls, 0);
  assert.equal(db.completions.length, 0);
  assert.equal(db.dispatches[0].ready, false);
  assert.equal(db.dispatches[0].error, ready.reason);
});

test('WHATSAPP_PROVIDER=test donne le fournisseur de test', () => {
  const p = createProviderFromEnv({ WHATSAPP_PROVIDER: 'test' });
  assert.ok(p instanceof TestProvider);
  assert.equal(p.isReady().ready, true);
  const p2 = createProviderFromEnv({ WHATSAPP_PROVIDER: 'test', WHATSAPP_TEST_MODE: 'echec_definitif' });
  assert.ok(p2 instanceof TestProvider);
  assert.equal((p2 as TestProvider).mode, 'permanent_failure');
});

test('templateIdsFromEnv : null si absent', () => {
  const ids = templateIdsFromEnv({ WHATSAPP_TEMPLATE_SELLER_NEW_ORDER: 'modele_vendeur', WHATSAPP_TEMPLATE_BUYER_ORDER_CONFIRMED: ' ' });
  assert.deepEqual(ids, {
    buyer_order_confirmed: null,
    buyer_out_for_delivery: null,
    seller_new_order: 'modele_vendeur',
    seller_order_reminder: null,
  });
});

test('succès : « sent » avec l\'identifiant du fournisseur', async () => {
  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  const provider = new TestProvider('success');
  const templates = { ...NO_TEMPLATES, seller_new_order: 'modele_vendeur' };

  const summary = await dispatchBatch(db, provider, templates, opts);

  assert.equal(db.claimCalls, 1);
  assert.deepEqual(db.completions, [{ id: job.id, outcome: 'sent', provider: 'test', providerMessageId: 'test-1', error: null }]);
  assert.equal(summary.sent, 1);
  assert.equal(summary.claimed, 1);
  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, SELLER_PHONE);
  assert.equal(provider.sent[0].templateId, 'modele_vendeur');
  assert.deepEqual(db.dispatches, [{ provider: 'test', ready: true, error: null }]);
});

test('échec temporaire : « retry »', async () => {
  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  const summary = await dispatchBatch(db, new TestProvider('temporary_failure'), NO_TEMPLATES, opts);
  assert.equal(db.completions.length, 1);
  assert.equal(db.completions[0].outcome, 'retry');
  assert.ok(db.completions[0].error);
  assert.equal(summary.retried, 1);
});

test('échec définitif (numéro invalide) : « failed »', async () => {
  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  const summary = await dispatchBatch(db, new TestProvider('permanent_failure'), NO_TEMPLATES, opts);
  assert.equal(db.completions[0].outcome, 'failed');
  assert.equal(summary.failed, 1);
});

test('contexte non pertinent : « skipped » avec la raison, rien n\'est envoyé', async () => {
  const job: ClaimedJob = { id: 'job-reminder', kind: 'seller_order_reminder', attempts: 1 };
  const db = new FakeDb([job], { [job.id]: { relevant: false, reason: 'already_handled' } });
  const provider = new TestProvider('success');
  const summary = await dispatchBatch(db, provider, NO_TEMPLATES, opts);
  assert.deepEqual(db.completions, [{ id: job.id, outcome: 'skipped', provider: 'test', providerMessageId: null, error: 'already_handled' }]);
  assert.equal(provider.sent.length, 0);
  assert.equal(summary.skipped, 1);
});

test('numéro absent ou invalide : « failed » sans envoi', async () => {
  const { ctx } = sellerJob();
  const jobs: ClaimedJob[] = [
    { id: 'no-phone', kind: 'seller_new_order' },
    { id: 'bad-phone', kind: 'seller_new_order' },
  ];
  const db = new FakeDb(jobs, {
    'no-phone': { ...ctx, to: null },
    'bad-phone': { ...ctx, to: '770000001' },
  });
  const provider = new TestProvider('success');
  const summary = await dispatchBatch(db, provider, NO_TEMPLATES, opts);
  assert.deepEqual(db.completions.map((c) => c.outcome), ['failed', 'failed']);
  assert.equal(provider.sent.length, 0);
  assert.equal(summary.failed, 2);
});

test('exception pendant l\'envoi : « retry », le lot continue', async () => {
  const a = sellerJob('job-a');
  const b = sellerJob('job-b');
  const db = new FakeDb([a.job, b.job], { [a.job.id]: a.ctx, [b.job.id]: b.ctx });
  let calls = 0;
  const flaky = {
    name: 'flaky',
    isReady: () => ({ ready: true }),
    send: (msg: WhatsAppMessage): Promise<SendResult> => {
      assert.equal(msg.to, SELLER_PHONE);
      calls += 1;
      if (calls === 1) return Promise.reject(new Error(`Délai dépassé pour ${SELLER_PHONE}`));
      return Promise.resolve({ ok: true, providerMessageId: 'x-2' });
    },
  };
  const summary = await dispatchBatch(db, flaky, NO_TEMPLATES, opts);
  assert.deepEqual(db.completions.map((c) => c.outcome), ['retry', 'sent']);
  assert.equal(summary.retried, 1);
  assert.equal(summary.sent, 1);
  // Le numéro complet n'apparaît ni dans l'erreur stockée ni dans les journaux.
  assert.ok(!(db.completions[0].error ?? '').includes(SELLER_PHONE));
  assert.ok(logs.every((l) => !l.includes(SELLER_PHONE) && !l.includes(BUYER_PHONE)));
});

test('exception du mode « exception » du fournisseur de test : « retry »', async () => {
  const { job, ctx } = sellerJob();
  const db = new FakeDb([job], { [job.id]: ctx });
  await dispatchBatch(db, new TestProvider('exception'), NO_TEMPLATES, opts);
  assert.equal(db.completions[0].outcome, 'retry');
});

test('paramètres incomplets : « failed » sans envoi', async () => {
  const job: ClaimedJob = { id: 'job-x', kind: 'seller_new_order' };
  const db = new FakeDb([job], { [job.id]: { relevant: true, kind: 'seller_new_order', to: SELLER_PHONE, params: { link: 'https://ezial.net/x' } } });
  const provider = new TestProvider('success');
  await dispatchBatch(db, provider, NO_TEMPLATES, opts);
  assert.equal(db.completions[0].outcome, 'failed');
  assert.equal(provider.sent.length, 0);
});

test('texte exact : confirmation de commande acheteur', () => {
  const msg = renderMessage('buyer_order_confirmed', {
    firstName: 'Awa',
    orderNumber: 'EZ-1001',
    items: [{ name: 'Tissu wax', quantity: 1.5 }, { name: 'Sac en cuir', quantity: 2 }],
    totalFcfa: 25000,
    delivery: 'Plateau',
  }, { ...NO_TEMPLATES, buyer_order_confirmed: 'modele_confirmation' }, BUYER_PHONE);
  assert.equal(msg.text,
    'Bonjour Awa,\n\n' +
    'Merci pour votre commande sur Ezial !\n\n' +
    'Votre commande n°EZ-1001 a bien été confirmée.\n\n' +
    'Récapitulatif :\n' +
    '- 1,5 × Tissu wax\n' +
    '- 2 × Sac en cuir\n\n' +
    'Total : 25 000 FCFA\n\n' +
    'Livraison : Plateau\n\n' +
    'Merci de votre confiance.\n' +
    'Ezial — ezial.net');
  assert.deepEqual(msg.params, ['Awa', 'EZ-1001', '1,5 × Tissu wax ; 2 × Sac en cuir', '25 000', 'Plateau']);
  assert.equal(msg.templateId, 'modele_confirmation');
  assert.equal(msg.to, BUYER_PHONE);
  assert.equal(msg.kind, 'buyer_order_confirmed');
  // Espace ordinaire, pas d'espace insécable.
  assert.ok(!/[\u00a0\u202f]/.test(msg.text));
});

test('texte exact : confirmation sans prénom', () => {
  const msg = renderMessage('buyer_order_confirmed', {
    firstName: '',
    orderNumber: 'EZ-1002',
    items: [{ name: 'Bazin', quantity: '3.250' }],
    totalFcfa: 1250000,
    delivery: 'Retrait en boutique',
  }, NO_TEMPLATES);
  assert.equal(msg.text,
    'Bonjour,\n\n' +
    'Merci pour votre commande sur Ezial !\n\n' +
    'Votre commande n°EZ-1002 a bien été confirmée.\n\n' +
    'Récapitulatif :\n' +
    '- 3,25 × Bazin\n\n' +
    'Total : 1 250 000 FCFA\n\n' +
    'Livraison : Retrait en boutique\n\n' +
    'Merci de votre confiance.\n' +
    'Ezial — ezial.net');
  assert.equal(msg.params[0], '');
  assert.equal(msg.templateId, null);
});

test('texte exact : commande en route (avec et sans prénom)', () => {
  const msg = renderMessage('buyer_out_for_delivery', { firstName: 'Moussa', orderNumber: 'EZ-1003' }, NO_TEMPLATES);
  assert.equal(msg.text,
    'Bonjour Moussa,\n\n' +
    'Votre commande Ezial n°EZ-1003 est en route !\n\n' +
    'Votre livreur est en chemin vers votre adresse de livraison.\n\n' +
    'Merci de rester disponible pour la réception.\n\n' +
    'Ezial — ezial.net');
  assert.deepEqual(msg.params, ['Moussa', 'EZ-1003']);
  const anon = renderMessage('buyer_out_for_delivery', { firstName: '', orderNumber: 'EZ-1003' }, NO_TEMPLATES);
  assert.ok(anon.text.startsWith('Bonjour,\n\nVotre commande Ezial n°EZ-1003 est en route !'));
});

test('texte exact : nouvelle commande vendeur (aucune donnée acheteur)', () => {
  const msg = renderMessage('seller_new_order', {
    orderNumber: 'EZ-1001',
    link: 'https://ezial.net/pro/seller/commandes/os-1',
    // Même si des données acheteur étaient présentes, elles ne doivent pas apparaître.
    firstName: 'Awa',
    delivery: 'Plateau',
    totalFcfa: 25000,
  }, NO_TEMPLATES, SELLER_PHONE);
  assert.equal(msg.text,
    'Bonjour,\n\n' +
    'Vous avez une nouvelle commande sur Ezial.\n\n' +
    'Commande n°EZ-1001\n\n' +
    'Consulter la commande :\n' +
    'https://ezial.net/pro/seller/commandes/os-1');
  assert.deepEqual(msg.params, ['EZ-1001', 'https://ezial.net/pro/seller/commandes/os-1']);
  for (const leak of ['Awa', 'Plateau', '25 000', '25000']) assert.ok(!msg.text.includes(leak));
});

test('texte exact : rappel vendeur (aucune donnée acheteur)', () => {
  const msg = renderMessage('seller_order_reminder', {
    orderNumber: 'EZ-1001',
    link: 'https://ezial.net/pro/seller/commandes/os-1',
    firstName: 'Awa',
  }, NO_TEMPLATES);
  assert.equal(msg.text,
    'Bonjour,\n\n' +
    'Votre commande Ezial n°EZ-1001 est toujours en attente de prise en charge.\n\n' +
    'Consulter la commande :\n' +
    'https://ezial.net/pro/seller/commandes/os-1');
  assert.deepEqual(msg.params, ['EZ-1001', 'https://ezial.net/pro/seller/commandes/os-1']);
  assert.ok(!msg.text.includes('Awa'));
});

test('mise en forme des nombres et masquage', () => {
  assert.equal(formatFcfa(25000), '25 000');
  assert.equal(formatFcfa(999), '999');
  assert.equal(formatFcfa('1500'), '1 500');
  assert.equal(formatQuantity(1.5), '1,5');
  assert.equal(formatQuantity(2), '2');
  assert.equal(formatQuantity('2.000'), '2');
  assert.equal(formatQuantity(0.1 + 0.2), '0,3');
  assert.equal(formatQuantity(1200), '1 200');
  assert.equal(maskPhone(BUYER_PHONE), '+22177•••01');
  assert.equal(redactPhones(`Numéro ${BUYER_PHONE} refusé le 2026-11-11`), 'Numéro +22177•••01 refusé le 2026-11-11');
});
