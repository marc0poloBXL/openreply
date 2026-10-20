"use client";

/**
 * CRM Dashboard — Leads & Birthday Readings
 *
 * Shows all leads with their consent status, zodiac sign, birthday reading
 * status, and pending followups. Matches the existing dashboard's styling.
 */

import { useEffect, useState } from "react";

interface LeadRow {
  id: string;
  email: string;
  phone: string | null;
  zodiacSign: string | null;
  stoicMatch: string | null;
  element: string | null;
  source: string;
  status: string;
  leadScore: number;
  consentEmail: boolean;
  consentSms: boolean;
  birthDate: string | null;
  createdAt: string;
  lastContactedAt: string | null;
  _readingCount: number;
  _pendingFollowups: number;
}

interface DashboardData {
  leads: LeadRow[];
  totals: {
    total: number;
    withEmailConsent: number;
    withSmsConsent: number;
    withBirthdayReading: number;
    pendingFollowups: number;
  };
}

const SOURCE_LABELS: Record<string, string> = {
  quiz: "Quiz",
  instagram: "Instagram",
  referral: "Referral",
  birthday_reading: "Birthday Reading",
};

const STATUS_BADGES: Record<string, string> = {
  new: "bg-gray-200 text-gray-700",
  nurturing: "bg-blue-100 text-blue-700",
  warm: "bg-amber-100 text-amber-700",
  customer: "bg-green-100 text-green-700",
  churned: "bg-red-100 text-red-700",
};

export default function LeadsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((res) => {
        if (res.success || res.ok) setData(res.data);
        else setError(res.error ?? "Failed to load leads");
      })
      .catch(() => setError("Failed to load leads"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="panel rounded p-4 h-24 sm:p-5">
          <div className="h-4 w-16 bg-zinc-200 rounded" />
          <div className="mt-3 h-6 w-20 bg-zinc-200/60 rounded" />
        </div>
      ))}
    </div>
  );

  if (error) return (
    <div className="panel rounded p-8 text-center">
      <p className="text-sm text-error">{error}</p>
    </div>
  );

  if (!data) return null;

  const { leads, totals } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">CRM — Leads</h1>
        <p className="text-sm text-muted mt-1">{totals.total} contacts</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="panel rounded p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total Leads</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totals.total}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email Consent</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totals.withEmailConsent}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">SMS Consent</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totals.withSmsConsent}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Birthday Readings</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totals.withBirthdayReading}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pending Followups</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totals.pendingFollowups}</p>
        </div>
      </div>

      {/* Leads Table */}
      <div className="panel rounded p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">All Leads</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No leads yet</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 border-b border-border">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 px-3 font-medium">Phone</th>
                  <th className="py-2 px-3 font-medium">Sign</th>
                  <th className="py-2 px-3 font-medium">Source</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium">Consent</th>
                  <th className="py-2 px-3 font-medium">Readings</th>
                  <th className="py-2 px-3 font-medium">Followups</th>
                  <th className="py-2 px-3 font-medium">Score</th>
                  <th className="py-2 pl-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <span className="text-foreground font-medium">{lead.email}</span>
                    </td>
                    <td className="py-3 px-3 text-muted">{lead.phone || "—"}</td>
                    <td className="py-3 px-3">
                      {lead.zodiacSign ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800">
                          {lead.zodiacSign}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-3 text-muted text-xs">
                      {SOURCE_LABELS[lead.source] || lead.source}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGES[lead.status] || "bg-gray-100 text-gray-600"}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs">
                      <span className={lead.consentEmail ? "text-green-600" : "text-zinc-400"}>
                        {lead.consentEmail ? "✓ Email" : "—"}
                      </span>
                      {lead.consentSms && (
                        <span className="ml-2 text-green-600">✓ SMS</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-muted">{lead._readingCount}</td>
                    <td className="py-3 px-3">
                      {lead._pendingFollowups > 0 ? (
                        <span className="text-amber-600 font-medium">{lead._pendingFollowups} pending</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-muted">{lead.leadScore}</td>
                    <td className="py-3 pl-3 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}