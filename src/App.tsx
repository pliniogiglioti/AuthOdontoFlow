import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logoLight from "@/assets/logo-light.png";
import { supabase } from "@/supabaseClient";

/** =========================
 * helpers (returnTo seguro)
 * ========================= */
function stripTokenHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const h = (u.hash || "").toLowerCase();
    if (h.includes("access_token=") || h.includes("refresh_token=") || h.includes("token_type=")) {
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
  const fallback = "https://lab.flowodonto.com.br/login";
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

function stripLogoutParam(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.searchParams.delete("logout");
    return u.toString();
  } catch {
    return urlStr;
  }
}

// Se vier returnTo dentro do returnTo (seu caso), pega o mais interno
function normalizeReturnTo(rawReturnTo: string | null) {
  const first = safeReturnTo(rawReturnTo);

  try {
    const u = new URL(first);
    const nested = u.searchParams.get("returnTo");
    if (!nested) return first;

    let decoded = nested;
    try {
      decoded = decodeURIComponent(nested);
    } catch {
      // ignore
    }
    return safeReturnTo(decoded);
  } catch {
    return first;
  }
}

function isSamePage(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return u.origin === window.location.origin && u.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

function truthyParam(v: string | null) {
  const x = (v ?? "").toLowerCase();
  return x === "1" || x === "true" || x === "yes";
}

function clearSupabaseStorageKeys() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("sb-")) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith("sb-")) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export default function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [booting, setBooting] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({ email: "", password: "" });

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawReturnTo = useMemo(() => params.get("returnTo"), [params]);

  const returnTo = useMemo(() => normalizeReturnTo(rawReturnTo), [rawReturnTo]);

  const isLogout = useMemo(() => {
    // 1) logout direto por query
    if (truthyParam(params.get("logout"))) return true;

    // 2) caso ainda exista /logout (se o SPA route funcionar)
    if (window.location.pathname === "/logout") return true;

    // 3) logout “escondido” dentro do returnTo (seu caso)
    try {
      const u = new URL(safeReturnTo(rawReturnTo));
      if (truthyParam(u.searchParams.get("logout"))) return true;
    } catch {
      // ignore
    }

    // 4) fallback bruto (se vier encoded)
    const raw = rawReturnTo ?? "";
    if (raw.includes("logout%3D1") || raw.includes("logout=1")) return true;

    return false;
  }, [params, rawReturnTo]);

  const redirectToAppWithSession = (session: any) => {
    if (!session) return;
    if (redirecting) return;

    const base = stripHash(stripTokenHash(returnTo));

    // trava anti-loop: se o returnTo for a própria página do auth
    if (isSamePage(base)) {
      setBooting(false);
      return;
    }

    const hash =
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
      `&token_type=bearer` +
      `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

    setRedirecting(true);
    window.location.replace(base + hash);
  };

  /** =========================
   * LOGOUT (à prova de returnTo aninhado)
   * ========================= */
  useEffect(() => {
    if (!isLogout) return;

    (async () => {
      setRedirecting(true);

      try {
        await supabase.auth.signOut({ scope: "global" as any });
      } catch {
        await supabase.auth.signOut();
      }

      clearSupabaseStorageKeys();

      const clean = stripHash(stripTokenHash(stripLogoutParam(returnTo)));
      window.location.replace(clean);
    })();
  }, [isLogout, returnTo]);

  /** =========================
   * Boot: checa sessão antes de renderizar login (tira pisca)
   * ========================= */
  useEffect(() => {
    if (isLogout) return;

    let mounted = true;
    setBooting(true);

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        redirectToAppWithSession(data.session);
        return;
      }

      setBooting(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event: any, session) => {
      if (session) {
        redirectToAppWithSession(session);
        return;
      }
      if (event === "INITIAL_SESSION") setBooting(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo, isLogout]);

  /** =========================
   * OAuth
   * ========================= */
    const loginOAuth = async (provider: "google" | "facebook" | "apple") => {
      setIsLoading(true);
      setErrorMsg(null);

      const cleanReturnTo = stripTokenHash(returnTo);
      const redirectBack = `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectBack },
      });

      if (error) {
        setErrorMsg(error.message);
        setIsLoading(false);
      }
    };

  /** =========================
   * Email + senha
   * ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.email || !formData.password) {
      setErrorMsg("Preencha todos os campos");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });
    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }
  };

  if (redirecting || booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
          <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">Digite suas credenciais para acessar</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <a href="https://flowodonto.com.br/recuperar-senha" className="text-sm text-primary hover:underline">
                  Esqueceu a senha?
                </a>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("google")}>
                Google
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("facebook")}>
                Facebook
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("apple")}>
                Apple
              </Button>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Não tem uma conta? </span>
              <a
                href="https://flowodonto.com.br/cadastro"
                className="text-primary hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cadastre-se
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">© 2024 OdontoFlow. Todos os direitos reservados.</p>
      </div>
    </div>
  );
}
