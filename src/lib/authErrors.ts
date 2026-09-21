// Translates raw Supabase Auth error messages (always in English, often
// technical — "Unable to validate email address: invalid format", "User
// already registered") into clean, professional French messages. Never let
// a raw Supabase error reach the UI directly.
export function mapAuthErrorMessage(raw: string | undefined | null): string {
  const msg = (raw ?? '').toLowerCase();

  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
    return 'Cette adresse email est déjà utilisée.';
  }
  if (msg.includes('invalid') && msg.includes('email')) {
    return 'Adresse email invalide.';
  }
  if (msg.includes('password') && (msg.includes('least') || msg.includes('short') || msg.includes('character'))) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connexion impossible. Vérifiez votre connexion internet et réessayez.';
  }
  return "Impossible de créer le compte. Vérifiez vos informations et réessayez.";
}

// Simple, deliberately permissive client-side check — just enough to catch
// an obviously malformed address (missing @, missing domain, spaces...)
// before spending a round trip to Supabase. Supabase itself remains the
// real validator.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Capitalizes only the first character, leaving the rest untouched — safe
// to run on every keystroke (doesn't fight the user's own casing further
// into the name, e.g. "Al-Amin" or "McKenzie").
export function capitalizeFirst(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
