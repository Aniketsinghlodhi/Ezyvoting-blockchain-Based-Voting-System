/**
 * deploy-full.js
 * Deploys the full EzyVoting contract system:
 *   1. VoterRegistry
 *   2. ElectionFactory (linked to VoterRegistry)
 *   3. VoteVerifier (linked to VoterRegistry)
 *
 * Outputs addresses to contract-addresses.json and .env fragment.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("═══════════════════════════════════════════════════════");
  console.log("  EzyVoting Full Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("Network:", hre.network.name);
  console.log("───────────────────────────────────────────────────────");

  // 1. Deploy VoterRegistry
  console.log("\n[1/3] Deploying VoterRegistry...");
  const VoterRegistry = await hre.ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await VoterRegistry.deploy();
  await voterRegistry.waitForDeployment();
  const vrAddress = await voterRegistry.getAddress();
  console.log("  ✓ VoterRegistry:", vrAddress);

  // 2. Deploy ElectionFactory (linked to VoterRegistry)
  console.log("\n[2/3] Deploying ElectionFactory...");
  const ElectionFactory = await hre.ethers.getContractFactory("ElectionFactory");
  const electionFactory = await ElectionFactory.deploy(vrAddress);
  await electionFactory.waitForDeployment();
  const efAddress = await electionFactory.getAddress();
  console.log("  ✓ ElectionFactory:", efAddress);

  // 3. Deploy VoteVerifier (linked to VoterRegistry)
  console.log("\n[3/3] Deploying VoteVerifier...");
  const VoteVerifier = await hre.ethers.getContractFactory("VoteVerifier");
  const voteVerifier = await VoteVerifier.deploy(vrAddress);
  await voteVerifier.waitForDeployment();
  const vvAddress = await voteVerifier.getAddress();
  console.log("  ✓ VoteVerifier:", vvAddress);

  // 4. Also deploy legacy EzyVoting for backward compatibility
  console.log("\n[+] Deploying legacy EzyVoting contract...");
  const EzyVoting = await hre.ethers.getContractFactory("EzyVoting");
  const ezyVoting = await EzyVoting.deploy();
  await ezyVoting.waitForDeployment();
  const legacyAddress = await ezyVoting.getAddress();
  console.log("  ✓ EzyVoting (legacy):", legacyAddress);

  // 5. Set up admin on VoterRegistry
  console.log("\n[Setup] Adding deployer as admin on VoterRegistry...");
  // Owner is already admin from constructor

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("═══════════════════════════════════════════════════════\n");

  const output = {
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      VoterRegistry: vrAddress,
      ElectionFactory: efAddress,
      VoteVerifier: vvAddress,
      EzyVoting: legacyAddress,
    },
  };

  // Write JSON
  const jsonPath = path.join(__dirname, "..", "contract-addresses.json");
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log("Addresses saved to contract-addresses.json");

  // Write legacy single-address file
  const legacyJsonPath = path.join(__dirname, "..", "contract-address.json");
  fs.writeFileSync(
    legacyJsonPath,
    JSON.stringify(
      { contractAddress: legacyAddress, network: hre.network.name, deployedAt: output.deployedAt },
      null,
      2
    )
  );

  // Write .env fragment
  const envFragment = `
# ── EzyVoting Contract Addresses (${hre.network.name}) ──
VOTER_REGISTRY_ADDRESS=${vrAddress}
ELECTION_FACTORY_ADDRESS=${efAddress}
VOTE_VERIFIER_ADDRESS=${vvAddress}
EZYVOTING_ADDRESS=${legacyAddress}
NEXT_PUBLIC_CONTRACT_ADDRESS=${legacyAddress}
NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS=${vrAddress}
NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS=${efAddress}
NEXT_PUBLIC_VOTE_VERIFIER_ADDRESS=${vvAddress}
`.trim();

  const envPath = path.join(__dirname, "..", ".env.contracts");
  fs.writeFileSync(envPath, envFragment + "\n");
  console.log("Env fragment saved to .env.contracts");

  console.log("\n┌──────────────────────────────────────────────────────┐");
  console.log("│  Contract Addresses                                  │");
  console.log("├──────────────────────────────────────────────────────┤");
  console.log(`│  VoterRegistry:    ${vrAddress}  │`);
  console.log(`│  ElectionFactory:  ${efAddress}  │`);
  console.log(`│  VoteVerifier:     ${vvAddress}  │`);
  console.log(`│  EzyVoting:        ${legacyAddress}  │`);
  console.log("└──────────────────────────────────────────────────────┘");

  // Verification instructions for Sepolia
  if (hre.network.name === "sepolia") {
    console.log("\n── Verify on Etherscan ──");
    console.log(`npx hardhat verify --network sepolia ${vrAddress}`);
    console.log(`npx hardhat verify --network sepolia ${efAddress} "${vrAddress}"`);
    console.log(`npx hardhat verify --network sepolia ${vvAddress} "${vrAddress}"`);
    console.log(`npx hardhat verify --network sepolia ${legacyAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
