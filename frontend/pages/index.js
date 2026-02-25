import { useState } from 'react';
import Navbar from '../components/Navbar';
import { getProvider } from '../lib/contract';

export default function Home() {
  const [account, setAccount] = useState(null);

  async function connectWallet() {
    if (!window.ethereum) return alert('Install MetaMask');
    const provider = getProvider();
    const accounts = await provider.send('eth_requestAccounts', []);
    setAccount(accounts[0]);
  }

  return (
    <div>
      <Navbar account={account} />
      <main style={{ padding: 24 }}>
        <h1>EzyVoting</h1>
        <p>Secure. Transparent. Blockchain-powered voting.</p>
        <div style={{ marginTop: 20 }}>
          <button onClick={connectWallet}>Connect MetaMask</button>
        </div>
        <section style={{ marginTop: 24 }}>
          <h2>Quick links</h2>
          <ul>
            <li><a href="/elections">Elections (Commit-Reveal Voting)</a></li>
            <li><a href="/voter/register">Voter Register</a></li>
            <li><a href="/voter/login">Voter Login</a></li>
            <li><a href="/voter/dashboard">Voter Dashboard (Legacy)</a></li>
            <li><a href="/admin/register">Admin Register (with invite code)</a></li>
            <li><a href="/admin/login">Admin Login</a></li>
            <li><a href="/admin/dashboard">Admin Dashboard</a></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
