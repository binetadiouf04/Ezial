#!/usr/bin/env node
// One-time maintenance script — NOT part of the running app, never imported
// by any frontend code. Finds product photos uploaded before the
// thumbnail/WebP pipeline shipped (thumbnail_storage_path is null) and
// brings them up to the current standard: a 240x300 WebP thumbnail plus a
// resized/re-encoded main photo, without ever breaking an existing product
// page while it runs.
//
// Requires the service_role key (bypasses RLS on purpose — this updates
// every seller's rows, not just one). That key must NEVER be committed or
// put in a frontend .env file — pass it only as an environment variable for
// this one run:
//
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... node scripts/migrate-legacy-product-images.mjs
//
// This script needs `sharp` for image resizing (not a project dependency —
// install it just for this run):
//
//   npm install --no-save sharp
//
// Safe by construction:
//   - Never touches original_storage_path (the pre-crop original, kept for
//     re-cropping later — untouched regardless of size).
//   - Uploads the new thumbnail + main files under brand-new unique paths
//     FIRST, verifies both are fetchable, and only THEN updates the
//     product_images row and deletes the old storage_path file. A failure
//     at any step before that leaves the product exactly as it was —
//     nothing is ever half-migrated or briefly broken for a shopper.
//   - Only processes rows where thumbnail_storage_path is null (the
//     unambiguous signal of "predates the current pipeline") — never
//     re-touches an already-migrated photo.
//   - Dry-run by default; pass --apply to actually write anything.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';
const THUMB_W = 240, THUMB_H = 300;
const MAIN_MAX_W = 960, MAIN_MAX_H = 1200;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('Find both in Supabase Dashboard → Project Settings → API (the service_role key, NOT the anon key).');
  process.exit(1);
}

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('This script needs `sharp`. Run: npm install --no-save sharp');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function randomToken() {
  return Math.random().toString(36).slice(2, 8);
}

async function downloadOriginal(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download failed for ${path}: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function uploadWebp(path, buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/webp',
    cacheControl: '31536000',
  });
  if (error) throw new Error(`upload failed for ${path}: ${error.message}`);
}

async function verifyPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const res = await fetch(data.publicUrl, { method: 'HEAD' });
  if (!res.ok) throw new Error(`verification failed for ${path}: HTTP ${res.status}`);
}

async function main() {
  console.log(APPLY ? 'Running in APPLY mode — this will write to Storage and the database.' : 'Dry run (pass --apply to actually migrate).');

  const { data: rows, error } = await supabase
    .from('product_images')
    .select('id, product_id, storage_path, thumbnail_storage_path')
    .is('thumbnail_storage_path', null)
    .not('storage_path', 'is', null);
  if (error) { console.error('Failed to list legacy images:', error.message); process.exit(1); }

  console.log(`Found ${rows.length} image(s) without a thumbnail (candidates for migration).`);
  if (rows.length === 0) return;

  let migrated = 0, failed = 0;
  for (const row of rows) {
    const prefix = row.storage_path.replace(/\/[^/]+$/, '');
    const token = randomToken();
    const newMainPath = `${prefix}/migrated-${token}-main.webp`;
    const newThumbPath = `${prefix}/migrated-${token}-thumb.webp`;

    try {
      console.log(`\n[${row.id}] ${row.storage_path}`);
      const original = await downloadOriginal(row.storage_path);

      const mainBuffer = await sharp(original)
        .resize({ width: MAIN_MAX_W, height: MAIN_MAX_H, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const thumbBuffer = await sharp(original)
        .resize(THUMB_W, THUMB_H, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();

      console.log(`  main:  ${(mainBuffer.length / 1024).toFixed(0)} Ko  thumb: ${(thumbBuffer.length / 1024).toFixed(0)} Ko`);

      if (!APPLY) { migrated++; continue; }

      await uploadWebp(newMainPath, mainBuffer);
      await uploadWebp(newThumbPath, thumbBuffer);
      await verifyPublicUrl(newMainPath);
      await verifyPublicUrl(newThumbPath);

      const { error: updateError } = await supabase
        .from('product_images')
        .update({ storage_path: newMainPath, thumbnail_storage_path: newThumbPath })
        .eq('id', row.id);
      if (updateError) throw new Error(`db update failed: ${updateError.message}`);

      // Only remove the OLD main file — never original_storage_path.
      await supabase.storage.from(BUCKET).remove([row.storage_path]);

      console.log('  OK — migrated and verified.');
      migrated++;
    } catch (err) {
      console.error(`  FAILED — left untouched: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${migrated} migrated, ${failed} failed (left exactly as they were).`);
}

await main();
