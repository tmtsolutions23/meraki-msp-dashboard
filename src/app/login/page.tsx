"use client";

import { useState, useEffect, FormEvent } from "react";
import { LayoutGrid, Lock } from "lucide-react";

export default function LoginPage() {
  useEffect(() => { document.title = "Sign In — Meraki MSP Dashboard"; }, []);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Read ?next= param for post-login redirect, default to /
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        // Validate: must start with /, not protocol-relative, and not an API path
        const dest = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api/") ? next : "/";
        window.location.replace(dest);
      } else {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-meraki-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-meraki-dark flex items-center justify-center mb-4">
            <LayoutGrid size={24} className="text-meraki-primary" />
          </div>
          <h1 className="text-xl font-bold text-meraki-text">Meraki MSP Dashboard</h1>
          <p className="text-sm text-meraki-muted mt-1">Enter your password to continue</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="bg-meraki-card border border-meraki-border rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-meraki-muted mb-2">
              Password
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-meraki-muted" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter dashboard password"
                autoFocus
                required
                autoComplete="current-password"
                className="w-full bg-meraki-surface border border-meraki-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-meraki-text placeholder-meraki-muted focus:border-meraki-primary transition-colors"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-meraki-red text-xs font-medium">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-meraki-primary hover:bg-meraki-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-meraki-muted mt-6">
          Cisco Meraki API v1
        </p>
      </div>
    </div>
  );
}
