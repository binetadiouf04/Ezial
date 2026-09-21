import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  leftIcon?: React.ReactNode;
  autoComplete?: string;
}

// One shared eye-toggle password input for every password field in the app
// (customer, seller, admin, reset) — a single place to keep the show/hide
// behavior and styling consistent.
export default function PasswordField({ value, onChange, placeholder, className = 'input-field', leftIcon, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {leftIcon}
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className}${leftIcon ? ' pl-11' : ''} pr-11`}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/35 hover:text-ink/60"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
