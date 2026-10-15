import { useEffect, useState } from "react";
import { acceptInvitation, getInvitation, type Invitation as InvitationInfo } from "../api/invitations";
import { ThemeToggle } from "../components/ThemeToggle";
import { PasswordField } from "../components/PasswordField";

interface InvitationProps {
  token: string;
  onDone: (username: string) => void;
  onCancel: () => void;
}

/** Landing page of an invitation or password reset link. */
export function Invitation({ token, onDone, onCancel }: InvitationProps) {
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getInvitation(token)
      .then(setInvitation)
      .catch(() => setInvalid(true));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation) return;
    if (password.length < invitation.minPasswordLength) {
      setError(`Le mot de passe doit faire au moins ${invitation.minPasswordLength} caractères.`);
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { username } = await acceptInvitation(token, password);
      onDone(username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__header">
        <h1>Scrabble</h1>
        <ThemeToggle />
      </div>

      {invalid ? (
        <div className="invitation__message">
          <p>Ce lien n'est plus valide : il a déjà servi ou a expiré. Demande un nouveau lien.</p>
          <button type="button" className="invitation__secondary" onClick={onCancel}>
            Aller à la connexion
          </button>
        </div>
      ) : !invitation ? (
        <p className="invitation__message">Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="invitation__intro">
            {invitation.kind === "invite" ? (
              <>
                Bienvenue <strong>{invitation.username}</strong> ! Choisis ton mot de passe pour rejoindre les
                parties.
              </>
            ) : (
              <>
                Nouveau mot de passe pour <strong>{invitation.username}</strong>.
              </>
            )}
          </p>
          {/* Lets password managers save the new password under the right name. */}
          <input type="text" autoComplete="username" value={invitation.username} readOnly style={{ display: "none" }} />
          <PasswordField label="Mot de passe" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordField
            label="Confirme le mot de passe"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
          />
          {error && <p className="login__error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : invitation.kind === "invite" ? "Rejoindre" : "Enregistrer"}
          </button>
        </form>
      )}
    </div>
  );
}
