/**
 * pages/elections/[ballot].js
 * Single election view with full commit-reveal voting flow.
 *
 * PHASES:
 *   COMMIT  — voter selects candidate, generates secret, submits hidden hash
 *   REVEAL  — voter reveals their candidate + secret to finalize vote
 *   TALLY   — results displayed, election can be finalized
 */

import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import Navbar from "../../components/Navbar";
import {
  getProvider,
  getBallot,
  getVoterRegistry,
  computeCommitHash,
  generateSecret,
  phaseLabel,
  PHASE_LABELS,
} from "../../lib/ballotContract";
import { showAlert } from "../../lib/alerts";

const PHASE = { COMMIT: 0, REVEAL: 1, TALLY: 2 };

export default function BallotPage() {
  const router = useRouter();
  const { ballot: ballotAddress } = router.query;

  const [account, setAccount] = useState(null);
  const [info, setInfo] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [voterStatus, setVoterStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  // Commit state
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [secret, setSecret] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [receiptHash, setReceiptHash] = useState("");
  const [committing, setCommitting] = useState(false);

  // Reveal state
  const [revealCandidateId, setRevealCandidateId] = useState("");
  const [revealSecret, setRevealSecret] = useState("");
  const [revealing, setRevealing] = useState(false);

  // Verify state
  const [verifyReceipt, setVerifyReceipt] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accs) => accs.length && setAccount(accs[0]));
    }
  }, []);

  const loadElection = useCallback(async () => {
    if (!ballotAddress) return;
    setLoading(true);
    try {
      const ballot = getBallot(ballotAddress);
      const raw = await ballot.getElectionInfo();
      setInfo({
        electionId: Number(raw._electionId),
        name: raw._name,
        commitDeadline: Number(raw._commitDeadline),
        revealDeadline: Number(raw._revealDeadline),
        totalCommits: Number(raw._totalCommits),
        totalReveals: Number(raw._totalReveals),
        candidateCount: Number(raw._candidateCount),
        phase: Number(raw._phase),
        isCancelled: raw._isCancelled,
        isFinalized: raw._isFinalized,
        constituencyId: Number(raw._constituencyId),
      });

      const cands = await ballot.getAllCandidates();
      setCandidates(
        cands.map((c) => ({
          id: Number(c.id),
          name: c.name,
          party: c.party,
          voteCount: Number(c.voteCount),
        }))
      );

      if (account) {
        const status = await ballot.getVoterCommitStatus(account);
        setVoterStatus({
          hasCommitted: status.hasCommitted,
          hasRevealed: status.hasRevealed,
          receiptHash: status.receiptHash,
          commitTimestamp: Number(status.commitTimestamp),
        });
      }
    } catch (err) {
      console.error(err);
      showAlert("Failed to load election: " + (err.reason || err.message), "error");
    } finally {
      setLoading(false);
    }
  }, [ballotAddress, account]);

  useEffect(() => {
    loadElection();
  }, [loadElection]);

  // ── Connect wallet ──
  async function connectWallet() {
    try {
      const provider = getProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length) {
        setAccount(accounts[0]);
        showAlert("Wallet connected", "success");
      }
    } catch {
      showAlert("Failed to connect wallet", "error");
    }
  }

  // ── COMMIT PHASE: generate secret & hash ──
  function onSelectCandidate(candidateId) {
    setSelectedCandidate(candidateId);
    const newSecret = generateSecret();
    setSecret(newSecret);
    const hash = computeCommitHash(candidateId, newSecret);
    setCommitHash(hash);
  }

  async function submitCommit() {
    if (!commitHash || !selectedCandidate) {
      showAlert("Select a candidate first", "error");
      return;
    }
    setCommitting(true);
    try {
      showAlert("Confirm commit transaction in your wallet...", "info", 0);
      const provider = getProvider();
      const signer = await provider.getSigner();
      const ballot = getBallot(ballotAddress, signer);

      const tx = await ballot.commitVote(commitHash);
      showAlert("Transaction submitted — waiting for confirmation...", "info", 0);
      const receipt = await tx.wait();

      // Extract receipt hash from event
      const event = receipt.logs.find((l) => {
        try {
          return ballot.interface.parseLog(l)?.name === "VoteCommitted";
        } catch {
          return false;
        }
      });
      if (event) {
        const parsed = ballot.interface.parseLog(event);
        setReceiptHash(parsed.args.receiptHash);
      }

      showAlert(
        "Vote committed! SAVE YOUR SECRET — you need it to reveal.",
        "success",
        8000
      );
      await loadElection();
    } catch (err) {
      console.error(err);
      const msg = err?.reason || err?.message || "Commit failed";
      showAlert("Error: " + msg, "error");
    } finally {
      setCommitting(false);
    }
  }

  // ── REVEAL PHASE ──
  async function submitReveal() {
    if (!revealCandidateId || !revealSecret) {
      showAlert("Enter candidate ID and secret", "error");
      return;
    }
    setRevealing(true);
    try {
      showAlert("Confirm reveal transaction in your wallet...", "info", 0);
      const provider = getProvider();
      const signer = await provider.getSigner();
      const ballot = getBallot(ballotAddress, signer);

      const tx = await ballot.revealVote(Number(revealCandidateId), revealSecret);
      showAlert("Transaction submitted — waiting for confirmation...", "info", 0);
      await tx.wait();

      showAlert("Vote revealed successfully! Your vote is now counted.", "success", 5000);
      await loadElection();
    } catch (err) {
      console.error(err);
      const msg = err?.reason || err?.message || "Reveal failed";
      if (msg.includes("hash mismatch")) {
        showAlert("Hash mismatch — check your candidate ID and secret", "error");
      } else {
        showAlert("Error: " + msg, "error");
      }
    } finally {
      setRevealing(false);
    }
  }

  // ── VERIFY RECEIPT ──
  async function verifyVoteReceipt() {
    if (!verifyReceipt || !account) {
      showAlert("Connect wallet and enter receipt hash", "error");
      return;
    }
    try {
      const ballot = getBallot(ballotAddress);
      const valid = await ballot.verifyReceipt(account, verifyReceipt);
      setVerifyResult(valid);
      showAlert(valid ? "Receipt is valid!" : "Receipt is NOT valid", valid ? "success" : "error");
    } catch (err) {
      showAlert("Verification error: " + (err.reason || err.message), "error");
    }
  }

  // ── FINALIZE ──
  async function finalizeElection() {
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const ballot = getBallot(ballotAddress, signer);
      const tx = await ballot.finalize();
      await tx.wait();
      showAlert("Election finalized!", "success");
      await loadElection();
    } catch (err) {
      showAlert("Finalize error: " + (err.reason || err.message), "error");
    }
  }

  function formatTime(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleString();
  }

  function timeRemaining(ts) {
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Ended";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m remaining`;
  }

  if (!ballotAddress) return <div className="container"><p>Loading...</p></div>;

  return (
    <div>
      <Navbar account={account} />
      <main className="container" style={{ paddingTop: "2rem", paddingBottom: "2rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ marginBottom: "0.5rem" }}>{info?.name || "Election"}</h1>
            <p className="text-muted" style={{ fontSize: "0.9rem" }}>
              Ballot: <code>{ballotAddress}</code>
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {!account && <button onClick={connectWallet}>Connect Wallet</button>}
            <button onClick={loadElection} disabled={loading} className={loading ? "loading btn-secondary" : "btn-secondary"}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {info && (
          <>
            {/* Election Info Card */}
            <div className="card" style={{ marginBottom: "2rem", borderLeft: "4px solid var(--primary)" }}>
              <div className="grid grid-2" style={{ gap: "1rem" }}>
                <div>
                  <strong>Phase:</strong>
                  <br />
                  <span style={{
                    display: "inline-block", padding: "4px 12px", borderRadius: "20px", marginTop: "4px",
                    fontSize: "0.85rem", fontWeight: 600,
                    background: info.phase === 0 ? "#dbeafe" : info.phase === 1 ? "#fef3c7" : "#d1fae5",
                    color: info.phase === 0 ? "#1e40af" : info.phase === 1 ? "#92400e" : "#065f46",
                  }}>
                    {info.isCancelled ? "CANCELLED" : info.isFinalized ? "FINALIZED" : phaseLabel(info.phase)}
                  </span>
                </div>
                <div>
                  <strong>Constituency:</strong>
                  <br />
                  {info.constituencyId === 0 ? "General (All)" : `#${info.constituencyId}`}
                </div>
                <div>
                  <strong>Commit Deadline:</strong>
                  <br />
                  {formatTime(info.commitDeadline)}
                  <br />
                  <small className="text-muted">{timeRemaining(info.commitDeadline)}</small>
                </div>
                <div>
                  <strong>Reveal Deadline:</strong>
                  <br />
                  {formatTime(info.revealDeadline)}
                  <br />
                  <small className="text-muted">{timeRemaining(info.revealDeadline)}</small>
                </div>
                <div>
                  <strong>Total Commits:</strong> {info.totalCommits}
                </div>
                <div>
                  <strong>Total Reveals:</strong> {info.totalReveals}
                </div>
              </div>
            </div>

            {/* Voter Status */}
            {account && voterStatus && (
              <div className="card" style={{ marginBottom: "2rem", background: "#f0f9ff", borderColor: "#bae6fd" }}>
                <h3 style={{ marginTop: 0 }}>Your Voting Status</h3>
                <div className="grid grid-2" style={{ gap: "1rem" }}>
                  <div>
                    <strong>Committed:</strong>{" "}
                    {voterStatus.hasCommitted ? (
                      <span style={{ color: "var(--success)" }}>Yes</span>
                    ) : (
                      <span style={{ color: "var(--gray-500)" }}>No</span>
                    )}
                  </div>
                  <div>
                    <strong>Revealed:</strong>{" "}
                    {voterStatus.hasRevealed ? (
                      <span style={{ color: "var(--success)" }}>Yes</span>
                    ) : (
                      <span style={{ color: "var(--gray-500)" }}>No</span>
                    )}
                  </div>
                  {voterStatus.hasCommitted && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <strong>Receipt Hash:</strong>
                      <br />
                      <code style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                        {voterStatus.receiptHash}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ━━━ COMMIT PHASE UI ━━━ */}
            {info.phase === PHASE.COMMIT && !info.isCancelled && (
              <section className="card" style={{ marginBottom: "2rem" }}>
                <h2 style={{ marginTop: 0 }}>Cast Your Vote (Commit Phase)</h2>
                <p className="text-muted">
                  Select a candidate below. A random secret will be generated.
                  Your vote is hidden until the reveal phase.
                </p>

                {voterStatus?.hasCommitted ? (
                  <div className="alert alert-success">
                    You have already committed your vote. Save your secret for the reveal phase!
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
                      {candidates.map((c) => (
                        <label
                          key={c.id}
                          style={{
                            display: "flex", alignItems: "center", gap: "1rem",
                            padding: "1rem", borderRadius: "8px", cursor: "pointer",
                            border: selectedCandidate === c.id ? "2px solid var(--primary)" : "2px solid var(--gray-200)",
                            background: selectedCandidate === c.id ? "#eff6ff" : "white",
                          }}
                        >
                          <input
                            type="radio"
                            name="candidate"
                            checked={selectedCandidate === c.id}
                            onChange={() => onSelectCandidate(c.id)}
                          />
                          <div>
                            <strong>{c.name}</strong>
                            <br />
                            <span className="text-muted">{c.party}</span>
                          </div>
                        </label>
                      ))}
                    </div>

                    {selectedCandidate && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fbbf24", padding: "1rem", borderRadius: "8px", marginBottom: "1rem" }}>
                        <strong>⚠ SAVE THIS SECRET — you will need it to reveal your vote:</strong>
                        <pre style={{ wordBreak: "break-all", fontSize: "0.8rem", margin: "0.5rem 0", padding: "0.5rem", background: "#fef3c7", borderRadius: "4px" }}>
                          {secret}
                        </pre>
                        <p className="text-muted" style={{ marginBottom: 0, fontSize: "0.85rem" }}>
                          Commit hash: <code style={{ fontSize: "0.75rem" }}>{commitHash}</code>
                        </p>
                      </div>
                    )}

                    <button
                      onClick={submitCommit}
                      disabled={!selectedCandidate || committing || !account}
                      className={committing ? "loading" : "btn-success"}
                      style={{ marginTop: "0.5rem" }}
                    >
                      {committing ? "Committing..." : "Commit Vote"}
                    </button>
                  </>
                )}

                {/* Display receipt after commit */}
                {receiptHash && (
                  <div className="alert alert-success" style={{ marginTop: "1rem" }}>
                    <strong>Vote Receipt:</strong>
                    <pre style={{ wordBreak: "break-all", fontSize: "0.8rem", margin: "0.5rem 0" }}>
                      {receiptHash}
                    </pre>
                    <small>Save this receipt to verify your vote later.</small>
                  </div>
                )}
              </section>
            )}

            {/* ━━━ REVEAL PHASE UI ━━━ */}
            {info.phase === PHASE.REVEAL && !info.isCancelled && (
              <section className="card" style={{ marginBottom: "2rem" }}>
                <h2 style={{ marginTop: 0 }}>Reveal Your Vote</h2>
                <p className="text-muted">
                  Enter the candidate ID and the secret you saved during the commit phase.
                  This proves your vote matches your commitment.
                </p>

                {voterStatus?.hasRevealed ? (
                  <div className="alert alert-success">
                    Your vote has been revealed and counted!
                  </div>
                ) : !voterStatus?.hasCommitted ? (
                  <div className="alert alert-warning">
                    You did not commit a vote during the commit phase.
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="revealCandidateId">Candidate ID:</label>
                      <input
                        id="revealCandidateId"
                        type="number"
                        min="1"
                        value={revealCandidateId}
                        onChange={(e) => setRevealCandidateId(e.target.value)}
                        placeholder="e.g., 1"
                        style={{ maxWidth: "200px" }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="revealSecret">Secret (from commit phase):</label>
                      <input
                        id="revealSecret"
                        type="text"
                        value={revealSecret}
                        onChange={(e) => setRevealSecret(e.target.value)}
                        placeholder="0x..."
                        style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                      />
                    </div>
                    <button
                      onClick={submitReveal}
                      disabled={revealing || !account}
                      className={revealing ? "loading" : "btn-success"}
                    >
                      {revealing ? "Revealing..." : "Reveal Vote"}
                    </button>
                  </>
                )}
              </section>
            )}

            {/* ━━━ TALLY / RESULTS ━━━ */}
            {(info.phase === PHASE.TALLY || info.isFinalized) && (
              <section className="card" style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ marginTop: 0 }}>Election Results</h2>
                  {!info.isFinalized && !info.isCancelled && (
                    <button onClick={finalizeElection} className="btn-secondary">
                      Finalize Election
                    </button>
                  )}
                </div>

                <div style={{ display: "grid", gap: "1rem" }}>
                  {candidates
                    .slice()
                    .sort((a, b) => b.voteCount - a.voteCount)
                    .map((c, idx) => {
                      const maxVotes = Math.max(...candidates.map((x) => x.voteCount));
                      const pct = info.totalReveals > 0 ? ((c.voteCount / info.totalReveals) * 100).toFixed(1) : 0;
                      const isWinner = c.voteCount === maxVotes && maxVotes > 0;
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: "1rem", borderRadius: "8px",
                            border: isWinner ? "2px solid var(--success)" : "1px solid var(--gray-200)",
                            background: isWinner ? "#f0fdf4" : "white",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <strong>
                                {isWinner && "🏆 "}
                                #{idx + 1} {c.name}
                              </strong>
                              <br />
                              <span className="text-muted">{c.party}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <strong style={{ fontSize: "1.5rem" }}>{c.voteCount}</strong>
                              <br />
                              <span className="text-muted">{pct}%</span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div style={{ marginTop: "0.75rem", background: "#e2e8f0", borderRadius: "4px", height: "8px" }}>
                            <div
                              style={{
                                width: `${pct}%`, height: "100%", borderRadius: "4px",
                                background: isWinner ? "var(--success)" : "var(--primary)",
                                transition: "width 0.5s ease",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "8px" }}>
                  <small className="text-muted">
                    Total Commits: {info.totalCommits} | Total Reveals: {info.totalReveals} |
                    Reveal Rate: {info.totalCommits > 0 ? ((info.totalReveals / info.totalCommits) * 100).toFixed(1) : 0}%
                  </small>
                </div>
              </section>
            )}

            {/* ━━━ VERIFY RECEIPT ━━━ */}
            <section className="card" style={{ marginBottom: "2rem" }}>
              <h2 style={{ marginTop: 0 }}>Verify Your Vote</h2>
              <p className="text-muted">
                Prove you participated without revealing who you voted for.
              </p>
              <div className="form-group">
                <label htmlFor="verifyReceipt">Receipt Hash:</label>
                <input
                  id="verifyReceipt"
                  type="text"
                  value={verifyReceipt}
                  onChange={(e) => setVerifyReceipt(e.target.value)}
                  placeholder="0x..."
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                />
              </div>
              <button onClick={verifyVoteReceipt} disabled={!account} className="btn-secondary">
                Verify Receipt
              </button>
              {verifyResult !== null && (
                <div className={`alert ${verifyResult ? "alert-success" : "alert-error"}`} style={{ marginTop: "1rem" }}>
                  {verifyResult ? "✓ Receipt is valid — you participated in this election." : "✕ Receipt is NOT valid."}
                </div>
              )}
            </section>

            {/* Cancelled Banner */}
            {info.isCancelled && (
              <div className="alert alert-error" style={{ marginBottom: "2rem" }}>
                This election has been cancelled.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
