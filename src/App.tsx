import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function stripTokenHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const h = (u.hash || "").toLowerCase();
    if (
      h.includes("access_token=") ||
      h.includes("refresh_token=") ||
      h.includes("token_type=")
    ) {
      u.hash = "";
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

function safeReturnTo(raw: string | null) {
  const fallback = "https://lab.flowodonto.com.br/";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowed = host === "flowodonto.com.br" || host.endsWith(".flowodonto.com.br");
    if (!allowed) return fallback;

    return stripTokenHash(url.toString());
  } catch {
    return fallback;
  }
}

function stripHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    return u.toString();
  } catch {
    return urlStr;
  }
}

function humanReturnToLabel(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const p = `${u.pathname}${u.search ? u.search : ""}`;
    return `${u.hostname}${p === "/" ? "" : p}`;
  } catch {
    return urlStr;
  }
}

export default function App() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const isLogout = useMemo(() => window.location.pathname === "/logout", []);
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return safeReturnTo(params.get("returnTo"));
  }, []);

  const returnToLabel = useMemo(() => humanReturnToLabel(returnTo), [returnTo]);

  const redirectToAppWithSession = (session: any) => {
    if (!session) return;

    const base = stripHash(stripTokenHash(returnTo));
    const hash =
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
      `&token_type=bearer` +
      `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

    setRedirecting(true);
    window.location.replace(base + hash);
  };

  // LOGOUT central
  useEffect(() => {
    if (!isLogout) return;

    (async () => {
      setRedirecting(true);
      try {
        await supabase.auth.signOut({ scope: "global" as any });
      } catch {
        await supabase.auth.signOut();
      }
      window.location.replace(stripHash(stripTokenHash(returnTo)));
    })();
  }, [isLogout, returnTo]);

  // LOGIN flow
  useEffect(() => {
    if (isLogout) return;

    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        redirectToAppWithSession(data.session);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) redirectToAppWithSession(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo, isLogout]);

  const loginGoogle = async () => {
    setBusy(true);
    setMsg(null);

    const cleanReturnTo = stripTokenHash(returnTo);
    const redirectBack = `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectBack },
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  };

  if (redirecting && isLogout) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <div style={styles.logo}>OF</div>
            <div>
              <div style={styles.brandTitle}>OdontoFlow</div>
              <div style={styles.brandSub}>Auth</div>
            </div>
          </div>
          <div style={styles.title}>Saindo...</div>
          <div style={styles.subtle}>Aguarde um instante.</div>
        </div>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <div style={styles.logo}>OF</div>
            <div>
              <div style={styles.brandTitle}>OdontoFlow</div>
              <div style={styles.brandSub}>Auth</div>
            </div>
          </div>
          <div style={styles.title}>Redirecionando...</div>
          <div style={styles.subtle}>Concluindo seu acesso.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.logo}>OF</div>
          <div>
            <div style={styles.brandTitle}>OdontoFlow</div>
            <div style={styles.brandSub}>Acesso unificado</div>
          </div>
        </div>

        <div style={styles.title}>Entrar</div>
        <div style={styles.subtle}>
          Você vai voltar para: <b style={styles.bold}>{returnToLabel}</b>
        </div>

        <button
          onClick={loginGoogle}
          disabled={busy}
          style={{
            ...styles.button,
            ...(busy ? styles.buttonDisabled : {}),
          }}
        >
          {busy ? "Abrindo Google..." : "Entrar com Google"}
        </button>

        {msg && <div style={styles.error}>{msg}</div>}

        <div style={styles.footer}>
          Ao continuar, você concorda com os termos de uso e política de privacidade.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background:
      "radial-gradient(1200px 600px at 10% 10%, rgba(99,102,241,0.20), transparent 60%), radial-gradient(900px 500px at 90% 30%, rgba(34,197,94,0.14), transparent 55%), radial-gradient(1000px 700px at 50% 100%, rgba(59,130,246,0.12), transparent 55%), #0b1220",
    color: "#e5e7eb",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    padding: 24,
    background: "rgba(17, 24, 39, 0.75)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(59,130,246,0.9))",
    color: "white",
    fontWeight: 800,
    letterSpacing: 0.5,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  brandSub: {
    fontSize: 12,
    color: "rgba(229,231,235,0.70)",
    marginTop: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    marginTop: 6,
    marginBottom: 8,
  },
  subtle: {
    fontSize: 13,
    color: "rgba(229,231,235,0.70)",
    lineHeight: 1.5,
    marginBottom: 18,
  },
  bold: {
    color: "#e5e7eb",
  },
  button: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5e7eb",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease",
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  error: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(220, 38, 38, 0.12)",
    border: "1px solid rgba(220, 38, 38, 0.25)",
    color: "rgba(254, 202, 202, 0.95)",
    fontSize: 13,
  },
  footer: {
    marginTop: 14,
    fontSize: 11,
    color: "rgba(229,231,235,0.55)",
    lineHeight: 1.45,
  },
};
