// Tests des règles de reprise de session vendeur (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySessionCheckError, isRefreshTokenRequestUrl } from './sellerSessionCore.ts';

test('erreur passagère avec une session encore enregistrée : jamais de déconnexion', () => {
  for (const error of [
    { name: 'AuthRetryableFetchError', status: 0 },
    { name: 'AuthRetryableFetchError', status: 503 },
    { name: 'AuthApiError', status: 500 },
    { name: 'AuthUnknownError' },
    { name: 'TypeError' },
    { name: 'TimeoutError' },
    { name: 'AuthApiError', status: 400 },
    null,
    undefined,
  ]) {
    assert.equal(classifySessionCheckError(error, true), 'unavailable', JSON.stringify(error));
  }
});

test('refus clair du serveur : connexion demandée', () => {
  assert.equal(classifySessionCheckError({ name: 'AuthSessionMissingError', status: 400 }, true), 'signed_out');
  assert.equal(classifySessionCheckError({ name: 'AuthApiError', status: 401 }, true), 'signed_out');
  assert.equal(classifySessionCheckError({ name: 'AuthApiError', status: 403 }, true), 'signed_out');
});

test('plus aucune session sur l\'appareil : connexion demandée, quelle que soit l\'erreur', () => {
  assert.equal(classifySessionCheckError({ name: 'AuthRetryableFetchError', status: 0 }, false), 'signed_out');
  assert.equal(classifySessionCheckError(null, false), 'signed_out');
});

test('reconnaît uniquement la requête de renouvellement du jeton', () => {
  assert.equal(isRefreshTokenRequestUrl('https://x.supabase.co/auth/v1/token?grant_type=refresh_token'), true);
  assert.equal(isRefreshTokenRequestUrl('http://127.0.0.1:54401/auth/v1/token?foo=1&grant_type=refresh_token'), true);
  assert.equal(isRefreshTokenRequestUrl('https://x.supabase.co/auth/v1/token?grant_type=password'), false);
  assert.equal(isRefreshTokenRequestUrl('https://x.supabase.co/auth/v1/token?grant_type=refresh_tokenx'), false);
  assert.equal(isRefreshTokenRequestUrl('https://x.supabase.co/rest/v1/shops?grant_type=refresh_token'), false);
  assert.equal(isRefreshTokenRequestUrl('https://x.supabase.co/auth/v1/user'), false);
});
