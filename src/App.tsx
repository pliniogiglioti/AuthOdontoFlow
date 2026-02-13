import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function stripTokenHash(urlStr: string) {
  try {
    const u = new URL(urlStr);

    // Se vier hash com tokens, remove (evita loop/duplicação)
    const h = (u.hash || "").toLowerCase();
    if (h.includes("access_token=") || h.includes("refresh_token=") || h.includes("token_type=")) {
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

    // só permite redirecionar para seus domínios
    const allowed = host === "flowodonto.com.br" || host.endsWith(".flowodonto.com.br");
    if (!allowed) return fallback;

    // remove qualquer hash com token (se alguém passar sem querer)
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

export default function App() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return safeReturnTo(params.get("returnTo"));
  }, []);

  const redirectToAppWithSession = (session: any) => {
    if (!session) return;

    // IMPORTANT: garante que NÃO vamos anexar hash em cima de hash
    const base = stripHash(stripTokenHash(returnTo));

    const hash =
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
      `&token_type=bearer` +
      `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

    setRedirecting(true);
    window.location.replace(base + hash);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        redirectToAppWithSession(data.session);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        redirectToAppWithSession(session);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo]);

  const loginGoogle = async () => {
    setBusy(true);
    setMsg(null);

    // volta pro próprio auth com o returnTo junto (limpo)
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

  if (redirecting) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40 }}>
        <h1>OdontoFlow Auth</h1>
        <p>Redirecionando...</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 40 }}>
      <h1 style={{ marginBottom: 8 }}>OdontoFlow Auth</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Você vai voltar para: <b>{returnTo}</b>
      </p>

      <button
        onClick={loginGoogle}
        disabled={busy}
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid #ddd",
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: 16,
        }}
      >
        {busy ? "Abrindo Google..." : "Entrar com Google"}
      </button>

      {msg && <p style={{ color: "crimson", marginTop: 16 }}>{msg}</p>}
    </div>
  );
}
