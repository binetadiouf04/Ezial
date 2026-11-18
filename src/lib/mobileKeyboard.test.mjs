// Tests de la détection du clavier virtuel (barre d'achat mobile).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isEditableTarget, isKeyboardLikelyOpen, KEYBOARD_OPENING_GRACE_MS } from './mobileKeyboard.ts';

test('champs qui ouvrent un clavier', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('éléments sans clavier', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'file' }), false);
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'text', readOnly: true }), false);
  assert.equal(isEditableTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isEditableTarget({ tagName: 'DIV' }), false);
  assert.equal(isEditableTarget(null), false);
});

const base = { editableFocused: true, layoutHeight: 800, visualHeight: 800, scale: 1, msSinceFocus: 5000, coarsePointer: true };

test('aucun champ actif : barre visible', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, editableFocused: false, visualHeight: 400 }), false);
});

test('iPhone / Android : le clavier réduit la zone visible → masquée', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, visualHeight: 470 }), true);
});

test('clavier fermé sans quitter le champ (retour Android) → visible', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, visualHeight: 800 }), false);
});

test('pendant l’ouverture du clavier (avant le redimensionnement) → masquée', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, msSinceFocus: 100 }), true);
  assert.equal(isKeyboardLikelyOpen({ ...base, msSinceFocus: KEYBOARD_OPENING_GRACE_MS + 1 }), false);
});

test('zoom par pincement sans clavier : pas confondu avec le clavier', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, visualHeight: 400, scale: 2 }), false);
});

test('ordinateur (souris) : jamais masquée sans réduction réelle', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, coarsePointer: false, msSinceFocus: 0 }), false);
});

test('navigateur sans visualViewport : masquée sur tactile pendant la saisie', () => {
  assert.equal(isKeyboardLikelyOpen({ ...base, visualHeight: null }), true);
  assert.equal(isKeyboardLikelyOpen({ ...base, visualHeight: null, coarsePointer: false }), false);
});
