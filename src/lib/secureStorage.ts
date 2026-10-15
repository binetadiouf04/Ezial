import { supabase } from './supabaseClient';

// Claim photos and delivery-proof photos live in their own PRIVATE bucket
// (never the public product-images one) — RLS on storage.objects restricts
// reads to the uploader, the customer/seller actually involved, and admins.
// Since the bucket isn't public, a plain getPublicUrl() would point at a
// URL nobody (not even the right people) can load — every read here goes
// through a short-lived signed URL instead.
export const SECURE_PHOTOS_BUCKET = 'secure-photos';
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — enough to view a page, never a durable link

export async function uploadSecurePhoto(path: string, file: Blob): Promise<{ error?: string }> {
  const { error } = await supabase.storage.from(SECURE_PHOTOS_BUCKET).upload(path, file, { cacheControl: '31536000' });
  return error ? { error: error.message } : {};
}

export async function resolveSecurePhotoUrl(path: string | null | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await supabase.storage.from(SECURE_PHOTOS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return undefined;
  return data.signedUrl;
}

export async function resolveSecurePhotoUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const urls = await Promise.all(paths.map((p) => resolveSecurePhotoUrl(p)));
  return urls.filter((u): u is string => Boolean(u));
}
