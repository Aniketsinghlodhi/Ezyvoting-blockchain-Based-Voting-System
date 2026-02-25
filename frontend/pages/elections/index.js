/**
 * pages/elections/index.js
 * Lists all elections from the ElectionFactory contract.
 */

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import {
  getProvider,
  getElectionFactory,
  getBallot,
  phaseLabel,
} from "../../lib/ballotContract";
import { showAlert } from "../../lib/alerts";

export default function ElectionsPage() {
  const [account, setAccount] = useState(null);
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accs) => accs.length && setAccount(accs[0]));
    }
  }, []);

  async function connectWallet() {
    try {
      const provider = getProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length) setAccount(accounts[0]);
    } catch {
      showAlert("Failed to connect wallet", "error");
    }
  }

  async function loadElections() {
    setLoading(true);
    try {
      const factory = getElectionFactory();
      if (!factory) {
        showAlert("ElectionFactory address not configured", "error");
        return;
      }

      const all = await factory.getAllElections();
      const enriched = [];

      for (const e of all) {
        const ballotAddr = e.ballotAddress;
        let info = {};
        try {
          const ballot = getBallot(ballotAddr);
          const raw = await ballot.getElectionInfo();
          info = {
            commitDeadline: Number(raw._commitDeadline),
            revealDeadline: Number(raw._revealDeadline),
            totalCommits: Number(raw._totalCommits),
            totalReveals: Number(raw._totalReveals),
            candidateCount: Number(raw._candidateCount),
            phase: Number(raw._phase),
            isCancelled: raw._isCancelled,
            isFinalized: raw._isFinalized,
          };
        } catch {
          info = { phase: -1 };
        }

        enriched.push({
          id: Number(e.id),
          name: e.name,
          description: e.description,
          ballotAddress: ballotAddr,
          createdAt: Number(e.createdAt),
          ...info,
        });
      }

      setElections(enriched);
      showAlert(`Loaded ${enriched.length} elections`, "success");
    } catch (err) {
      console.error(err);
      showAlert("Failed to load elections: " + (err.reason || err.message), "error");
    } finally {
      setLoading(false);
    }
  }

  function formatTime(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleString();
  }

  function phaseBadge(phase, isCancelled, isFinalized) {
    if (isCancelled) return <span style={styles.badgeDanger}>CANCELLED</span>;
    if (isFinalized) return <span style={styles.badgeSuccess}>FINALIZED</span>;
    const colors = {
      0: styles.badgePrimary,
      1: styles.badgeWarning,
      2: styles.badgeSuccess,
    };
    return <span style={colors[phase] || styles.badge}>{phaseLabel(phase)}</span>;
  }

  return (
    <div>
      <Navbar account={account} />
      <main className="container" style={{ paddingTop: "2rem", paddingBottom: "2rem" }}>
        <h1>Elections</h1>
        <p className="text-muted">Browse active and past elections on the blockchain.</p>

        <div style={{ marginBottom: "2rem", display: "flex", gap: "1rem" }}>
          {!account && <button onClick={connectWallet}>Connect Wallet</button>}
          <button onClick={loadElections} disabled={loading} className={loading ? "loading" : ""}>
            {loading ? "Loading..." : "Load Elections"}
          </button>
        </div>

        {elections.length === 0 ? (
          <div className="alert alert-info">No elections loaded. Click "Load Elections" to fetch from blockchain.</div>
        ) : (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            {elections.map((e) => (
              <div key={e.id} className="card" style={{ borderLeft: "4px solid var(--primary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
                      #{e.id} — {e.name}
                    </h3>
                    {e.description && <p className="text-muted">{e.description}</p>}
                  </div>
                  {phaseBadge(e.phase, e.isCancelled, e.isFinalized)}
                </div>

                <div className="grid grid-2" style={{ gap: "1rem", marginTop: "1rem" }}>
                  <div>
                    <strong>Commit Deadline:</strong>
                    <br />
                    {formatTime(e.commitDeadline)}
                  </div>
                  <div>
                    <strong>Reveal Deadline:</strong>
                    <br />
                    {formatTime(e.revealDeadline)}
                  </div>
                  <div>
                    <strong>Commits / Reveals:</strong>
                    <br />
                    {e.totalCommits ?? "?"} / {e.totalReveals ?? "?"}
                  </div>
                  <div>
                    <strong>Candidates:</strong>
                    <br />
                    {e.candidateCount ?? "?"}
                  </div>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <a href={`/elections/${e.ballotAddress}`}>
                    <button>View Election →</button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  badge: {
    display: "inline-block", padding: "4px 12px", borderRadius: "20px",
    fontSize: "0.8rem", fontWeight: 600, background: "#e2e8f0", color: "#475569",
  },
  badgePrimary: {
    display: "inline-block", padding: "4px 12px", borderRadius: "20px",
    fontSize: "0.8rem", fontWeight: 600, background: "#dbeafe", color: "#1e40af",
  },
  badgeWarning: {
    display: "inline-block", padding: "4px 12px", borderRadius: "20px",
    fontSize: "0.8rem", fontWeight: 600, background: "#fef3c7", color: "#92400e",
  },
  badgeSuccess: {
    display: "inline-block", padding: "4px 12px", borderRadius: "20px",
    fontSize: "0.8rem", fontWeight: 600, background: "#d1fae5", color: "#065f46",
  },
  badgeDanger: {
    display: "inline-block", padding: "4px 12px", borderRadius: "20px",
    fontSize: "0.8rem", fontWeight: 600, background: "#fee2e2", color: "#991b1b",
  },
};
