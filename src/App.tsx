import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/** =========================
 * Helpers de URL / segurança
 * ========================= */
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

function stripHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.hash = "";
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

function returnToLabel(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const p = `${u.pathname}${u.search ? u.search : ""}`;
    return `${u.hostname}${p === "/" ? "" : p}`;
  } catch {
    return urlStr;
  }
}

/** =========================
 * App (Auth Hub)
 * ========================= */
export default function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [busyOAuth, setBusyOAuth] = useState<null | "google" | "facebook" | "apple">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const [formData, setFormData] = useState({ email: "", password: "" });

  const isLogout = useMemo(() => window.location.pathname === "/logout", []);
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return safeReturnTo(params.get("returnTo"));
  }, []);

  const returnToText = useMemo(() => returnToLabel(returnTo), [returnTo]);

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

  // Se já tiver sessão no AUTH, já devolve para o app
  useEffect(() => {
    if (isLogout) return;

    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) redirectToAppWithSession(data.session);
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

  // Redirect back do provider para o AUTH (para o AUTH ler a sessão e “empacotar” tokens pro app)
  const redirectBackToAuth = () => {
    const cleanReturnTo = stripTokenHash(returnTo);
    return `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;
  };

  const loginOAuth = async (provider: "google" | "facebook" | "apple") => {
    setMsg(null);
    setBusyOAuth(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectBackToAuth() },
    });

    if (error) {
      setMsg(error.message);
      setBusyOAuth(null);
    }
  };

  const loginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!formData.email || !formData.password) {
      setMsg("Preencha todos os campos.");
      return;
    }

    setIsLoadingEmail(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    setIsLoadingEmail(false);

    if (error) {
      setMsg(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }

    if (data?.session) {
      redirectToAppWithSession(data.session);
    }
  };

  if (redirecting && isLogout) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.card}>
            <div style={styles.title}>Saindo...</div>
            <div style={styles.sub}>Aguarde um instante.</div>
          </div>
        </div>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.card}>
            <div style={styles.title}>Redirecionando...</div>
            <div style={styles.sub}>Concluindo seu acesso.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        {/* Logo / topo */}
        <div style={styles.logoBox}>
          {/* Se quiser, depois colocamos um <img> aqui. */}
          <div style={styles.logoCircle}>OF</div>
          <div style={styles.logoText}>
            <div style={styles.logoTitle}>OdontoFlow</div>
            <div style={styles.logoSub}>Gestão de Próteses Odontológicas</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>Entrar</div>
            <div style={styles.cardDesc}>Digite suas credenciais para acessar</div>
            <div style={styles.returnTo}>
              Você vai voltar para: <b>{returnToText}</b>
            </div>
          </div>

          <div style={styles.cardContent}>
            <form onSubmit={loginEmail} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <label htmlFor="email" style={styles.label}>E-mail</label>
                <input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoadingEmail || !!busyOAuth}
                  style={styles.input}
                />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label htmlFor="password" style={styles.label}>Senha</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={isLoadingEmail || !!busyOAuth}
                    style={{ ...styles.input, paddingRight: 90 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={isLoadingEmail || !!busyOAuth}
                    style={styles.showBtn}
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <a href="https://flowodonto.com.br/esqueci-senha" style={styles.link}>
                  Esqueceu a senha?
                </a>
              </div>

              <button
                type="submit"
                disabled={isLoadingEmail || !!busyOAuth}
                style={{
                  ...styles.primaryBtn,
                  opacity: isLoadingEmail || !!busyOAuth ? 0.75 : 1,
                  cursor: isLoadingEmail || !!busyOAuth ? "not-allowed" : "pointer",
                }}
              >
                {isLoadingEmail ? "Entrando..." : "Entrar"}
              </button>
            </form>

            {/* divisor */}
            <div style={styles.divider}>
              <div style={styles.divLine} />
              <div style={styles.divText}>ou continue com</div>
              <div style={styles.divLine} />
            </div>

            <div style={styles.providers}>
              <button
                type="button"
                disabled={isLoadingEmail || !!busyOAuth}
                onClick={() => loginOAuth("google")}
                style={styles.outlineBtn}
              >
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {busyOAuth === "google" ? "Abrindo..." : "Google"}
              </button>

              <button
                type="button"
                disabled={isLoadingEmail || !!busyOAuth}
                onClick={() => loginOAuth("facebook")}
                style={styles.outlineBtn}
              >
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                {busyOAuth === "facebook" ? "Abrindo..." : "Facebook"}
              </button>

              <button
                type="button"
                disabled={isLoadingEmail || !!busyOAuth}
                onClick={() => loginOAuth("apple")}
                style={styles.outlineBtn}
              >
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                {busyOAuth === "apple" ? "Abrindo..." : "Apple"}
              </button>
            </div>

            <div style={styles.signup}>
              <span style={{ color: "rgba(15,23,42,0.65)" }}>Não tem uma conta? </span>
              <a href="https://flowodonto.com.br/cadastro" style={{ ...styles.link, fontWeight: 700 }}>
                Cadastre-se
              </a>
            </div>

            {msg && <div style={styles.error}>{msg}</div>}
          </div>
        </div>

        <div style={styles.copy}>© 2024 OdontoFlow. Todos os direitos reservados.</div>
      </div>
    </div>
  );
}

/** =========================
 * Estilos (sem shadcn)
 * ========================= */
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.12), transparent 35%), linear-gradient(225deg, rgba(34,197,94,0.12), transparent 40%), #f8fafc",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
    color: "#0f172a",
  },
  wrap: {
    width: "100%",
    maxWidth: 520,
  },
  logoBox: {
    textAlign: "center",
    marginBottom: 18,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
    color: "white",
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  logoText: { textAlign: "center" },
  logoTitle: { fontWeight: 900, fontSize: 18, lineHeight: 1.2 },
  logoSub: { marginTop: 2, fontSize: 13, color: "rgba(15,23,42,0.65)" },

  card: {
    borderRadius: 16,
    background: "white",
    boxShadow: "0 18px 40px rgba(2,6,23,0.12)",
    border: "1px solid rgba(2,6,23,0.08)",
    overflow: "hidden",
  },
  cardHeader: {
    padding: 18,
    paddingBottom: 10,
  },
  cardTitle: { fontSize: 22, fontWeight: 900, textAlign: "center" },
  cardDesc: { marginTop: 6, fontSize: 13, textAlign: "center", color: "rgba(15,23,42,0.65)" },
  returnTo: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center",
    color: "rgba(15,23,42,0.55)",
  },
  cardContent: { padding: 18, paddingTop: 10 },

  label: { fontSize: 12, fontWeight: 700 },
  input: {
    width: "100%",
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.14)",
    padding: "0 12px",
    outline: "none",
    background: "white",
  },
  showBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    color: "rgba(15,23,42,0.65)",
    fontWeight: 800,
    cursor: "pointer",
    padding: "6px 8px",
    borderRadius: 10,
  },
  link: {
    fontSize: 12,
    color: "#2563eb",
    textDecoration: "none",
  },

  primaryBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  divider: {
    marginTop: 18,
    marginBottom: 14,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 10,
  },
  divLine: { height: 1, background: "rgba(2,6,23,0.12)" },
  divText: { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(15,23,42,0.55)" },

  providers: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  outlineBtn: {
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.14)",
    background: "white",
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  signup: { marginTop: 16, textAlign: "center", fontSize: 13 },

  error: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.08)",
    border: "1px solid rgba(220,38,38,0.22)",
    color: "rgba(185,28,28,0.95)",
    fontSize: 13,
  },

  copy: { marginTop: 14, textAlign: "center", fontSize: 11, color: "rgba(15,23,42,0.55)" },
};
