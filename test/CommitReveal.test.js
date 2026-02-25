/**
 * test/CommitReveal.test.js
 *
 * Comprehensive tests for the commit-reveal voting system:
 *   - VoterRegistry
 *   - ElectionFactory + Ballot
 *   - VoteVerifier
 *
 * Tests cover: deployment, voter registration, election creation,
 * commit-reveal flow, double voting prevention, finalization,
 * receipt verification, and election integrity checks.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Commit-Reveal Voting System", function () {
  let owner, admin, voter1, voter2, voter3, outsider;
  let voterRegistry, electionFactory, voteVerifier;

  // Helpers
  function hashIdentity(id) {
    return ethers.keccak256(ethers.toUtf8Bytes(id));
  }

  function computeCommitHash(candidateId, secret) {
    return ethers.solidityPackedKeccak256(
      ["uint256", "bytes32"],
      [candidateId, secret]
    );
  }

  function randomSecret() {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  beforeEach(async function () {
    [owner, admin, voter1, voter2, voter3, outsider] = await ethers.getSigners();

    // Deploy VoterRegistry
    const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = await VoterRegistry.deploy();
    await voterRegistry.waitForDeployment();

    // Deploy ElectionFactory (linked to VoterRegistry)
    const ElectionFactory = await ethers.getContractFactory("ElectionFactory");
    electionFactory = await ElectionFactory.deploy(await voterRegistry.getAddress());
    await electionFactory.waitForDeployment();

    // Deploy VoteVerifier
    const VoteVerifier = await ethers.getContractFactory("VoteVerifier");
    voteVerifier = await VoteVerifier.deploy(await voterRegistry.getAddress());
    await voteVerifier.waitForDeployment();

    // Setup: add admin
    await voterRegistry.connect(owner).addAdmin(admin.address);
    await electionFactory.connect(owner).addAdmin(admin.address);
  });

  // ═══════════════════════════════════════════════════════════════
  // VOTER REGISTRY
  // ═══════════════════════════════════════════════════════════════
  describe("VoterRegistry", function () {
    it("should deploy with correct owner", async function () {
      expect(await voterRegistry.owner()).to.equal(owner.address);
    });

    it("should allow owner to add admin", async function () {
      expect(await voterRegistry.admins(admin.address)).to.be.true;
    });

    it("should register a voter", async function () {
      const idHash = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1);

      const info = await voterRegistry.getVoterInfo(voter1.address);
      expect(info.registered).to.be.true;
      expect(info.active).to.be.true;
      expect(info.constituencyId).to.equal(1);
      expect(await voterRegistry.totalVoters()).to.equal(1);
    });

    it("should emit VoterRegistered event", async function () {
      const idHash = hashIdentity("VOTER-002");
      await expect(voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1))
        .to.emit(voterRegistry, "VoterRegistered")
        .withArgs(voter1.address, 1, await time.latest());
    });

    it("should prevent duplicate wallet registration", async function () {
      const idHash1 = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash1, 1);

      const idHash2 = hashIdentity("VOTER-002");
      await expect(
        voterRegistry.connect(admin).registerVoter(voter1.address, idHash2, 1)
      ).to.be.revertedWith("VR: wallet already registered");
    });

    it("should prevent duplicate identity registration", async function () {
      const idHash = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1);

      await expect(
        voterRegistry.connect(admin).registerVoter(voter2.address, idHash, 1)
      ).to.be.revertedWith("VR: identity already used");
    });

    it("should check eligibility", async function () {
      const idHash = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1);

      expect(await voterRegistry.isEligible(voter1.address)).to.be.true;
      expect(await voterRegistry.isEligible(voter2.address)).to.be.false;
    });

    it("should deactivate and reactivate a voter", async function () {
      const idHash = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1);

      await voterRegistry.connect(admin).deactivateVoter(voter1.address, "Fraud detected");
      expect(await voterRegistry.isEligible(voter1.address)).to.be.false;

      await voterRegistry.connect(admin).reactivateVoter(voter1.address);
      expect(await voterRegistry.isEligible(voter1.address)).to.be.true;
    });

    it("should verify identity hash", async function () {
      const idHash = hashIdentity("VOTER-001");
      await voterRegistry.connect(admin).registerVoter(voter1.address, idHash, 1);

      expect(await voterRegistry.verifyIdentity(voter1.address, idHash)).to.be.true;
      expect(await voterRegistry.verifyIdentity(voter1.address, hashIdentity("WRONG")))
        .to.be.false;
    });

    it("should restrict non-admin from registering voters", async function () {
      const idHash = hashIdentity("VOTER-001");
      await expect(
        voterRegistry.connect(outsider).registerVoter(voter1.address, idHash, 1)
      ).to.be.revertedWith("VR: only admin");
    });

    it("should only allow owner to add/remove admins", async function () {
      await expect(
        voterRegistry.connect(admin).addAdmin(outsider.address)
      ).to.be.revertedWith("VR: only owner");

      await expect(
        voterRegistry.connect(admin).removeAdmin(owner.address)
      ).to.be.revertedWith("VR: only owner");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ELECTION FACTORY + BALLOT
  // ═══════════════════════════════════════════════════════════════
  describe("ElectionFactory & Ballot", function () {
    let ballotAddress, ballot;
    const COMMIT_DURATION = 3600; // 1 hour
    const REVEAL_DURATION = 3600; // 1 hour

    async function createTestElection() {
      const now = await time.latest();
      const commitDeadline = now + COMMIT_DURATION;
      const revealDeadline = now + COMMIT_DURATION + REVEAL_DURATION;

      const tx = await electionFactory.connect(admin).createElection(
        "Test Election 2026",
        "A test election",
        commitDeadline,
        revealDeadline,
        ["Alice", "Bob", "Carol"],
        ["Party A", "Party B", "Party C"],
        0, // general
        0  // GENERAL type
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => {
        try {
          return electionFactory.interface.parseLog(l)?.name === "ElectionCreated";
        } catch {
          return false;
        }
      });
      const parsed = electionFactory.interface.parseLog(event);
      ballotAddress = parsed.args.ballotAddress;

      const Ballot = await ethers.getContractFactory("Ballot");
      ballot = Ballot.attach(ballotAddress);

      return { commitDeadline, revealDeadline };
    }

    beforeEach(async function () {
      // Register voters
      await voterRegistry.connect(admin).registerVoter(voter1.address, hashIdentity("V1"), 1);
      await voterRegistry.connect(admin).registerVoter(voter2.address, hashIdentity("V2"), 1);
      await voterRegistry.connect(admin).registerVoter(voter3.address, hashIdentity("V3"), 2);
    });

    it("should create an election and deploy a Ballot", async function () {
      await createTestElection();

      expect(ballotAddress).to.not.equal(ethers.ZeroAddress);
      expect(await electionFactory.getElectionCount()).to.equal(1);

      const info = await ballot.getElectionInfo();
      expect(info._name).to.equal("Test Election 2026");
      expect(info._candidateCount).to.equal(3);
      expect(Number(info._phase)).to.equal(0); // COMMIT
    });

    it("should list all candidates", async function () {
      await createTestElection();
      const candidates = await ballot.getAllCandidates();
      expect(candidates.length).to.equal(3);
      expect(candidates[0].name).to.equal("Alice");
      expect(candidates[1].name).to.equal("Bob");
      expect(candidates[2].name).to.equal("Carol");
    });

    it("should allow getAllElections from factory", async function () {
      await createTestElection();
      const all = await electionFactory.getAllElections();
      expect(all.length).to.equal(1);
      expect(all[0].name).to.equal("Test Election 2026");
    });

    // ── Commit Phase Tests ──
    describe("Commit Phase", function () {
      let secret1, secret2;

      beforeEach(async function () {
        await createTestElection();
        secret1 = randomSecret();
        secret2 = randomSecret();
      });

      it("should accept a valid vote commit", async function () {
        const hash = computeCommitHash(1, secret1);
        await expect(ballot.connect(voter1).commitVote(hash))
          .to.emit(ballot, "VoteCommitted");

        const status = await ballot.getVoterCommitStatus(voter1.address);
        expect(status.hasCommitted).to.be.true;
        expect(status.hasRevealed).to.be.false;
        expect(await ballot.totalCommits()).to.equal(1);
      });

      it("should prevent double commit", async function () {
        const hash = computeCommitHash(1, secret1);
        await ballot.connect(voter1).commitVote(hash);

        await expect(
          ballot.connect(voter1).commitVote(hash)
        ).to.be.revertedWith("Ballot: already committed");
      });

      it("should prevent ineligible voter from committing", async function () {
        const hash = computeCommitHash(1, secret1);
        await expect(
          ballot.connect(outsider).commitVote(hash)
        ).to.be.revertedWith("Ballot: not eligible");
      });

      it("should reject empty commit hash", async function () {
        await expect(
          ballot.connect(voter1).commitVote(ethers.ZeroHash)
        ).to.be.revertedWith("Ballot: empty hash");
      });

      it("should allow multiple voters to commit", async function () {
        await ballot.connect(voter1).commitVote(computeCommitHash(1, secret1));
        await ballot.connect(voter2).commitVote(computeCommitHash(2, secret2));

        expect(await ballot.totalCommits()).to.equal(2);
      });
    });

    // ── Reveal Phase Tests ──
    describe("Reveal Phase", function () {
      let secret1, secret2;

      beforeEach(async function () {
        const { commitDeadline } = await createTestElection();
        secret1 = randomSecret();
        secret2 = randomSecret();

        // Commit votes
        await ballot.connect(voter1).commitVote(computeCommitHash(1, secret1));
        await ballot.connect(voter2).commitVote(computeCommitHash(2, secret2));

        // Advance time past commit deadline
        await time.increaseTo(commitDeadline + 1);
      });

      it("should be in REVEAL phase", async function () {
        expect(await ballot.currentPhase()).to.equal(1);
      });

      it("should accept a valid reveal", async function () {
        await expect(ballot.connect(voter1).revealVote(1, secret1))
          .to.emit(ballot, "VoteRevealed");

        const status = await ballot.getVoterCommitStatus(voter1.address);
        expect(status.hasRevealed).to.be.true;
        expect(await ballot.totalReveals()).to.equal(1);
      });

      it("should reject reveal with wrong secret", async function () {
        const wrongSecret = randomSecret();
        await expect(
          ballot.connect(voter1).revealVote(1, wrongSecret)
        ).to.be.revertedWith("Ballot: hash mismatch");
      });

      it("should reject reveal with wrong candidate", async function () {
        await expect(
          ballot.connect(voter1).revealVote(2, secret1) // voted for 1, revealing 2
        ).to.be.revertedWith("Ballot: hash mismatch");
      });

      it("should prevent double reveal", async function () {
        await ballot.connect(voter1).revealVote(1, secret1);
        await expect(
          ballot.connect(voter1).revealVote(1, secret1)
        ).to.be.revertedWith("Ballot: already revealed");
      });

      it("should correctly tally votes after reveals", async function () {
        await ballot.connect(voter1).revealVote(1, secret1);
        await ballot.connect(voter2).revealVote(2, secret2);

        const candidates = await ballot.getAllCandidates();
        expect(candidates[0].voteCount).to.equal(1); // Alice
        expect(candidates[1].voteCount).to.equal(1); // Bob
        expect(candidates[2].voteCount).to.equal(0); // Carol
      });

      it("should prevent commits during reveal phase", async function () {
        const newSecret = randomSecret();
        await expect(
          ballot.connect(voter3).commitVote(computeCommitHash(1, newSecret))
        ).to.be.revertedWith("Ballot: wrong phase");
      });
    });

    // ── Tally / Finalization Tests ──
    describe("Tally & Finalization", function () {
      let secret1, secret2;

      beforeEach(async function () {
        const { commitDeadline, revealDeadline } = await createTestElection();
        secret1 = randomSecret();
        secret2 = randomSecret();

        // Commit
        await ballot.connect(voter1).commitVote(computeCommitHash(1, secret1));
        await ballot.connect(voter2).commitVote(computeCommitHash(1, secret2));

        // Advance to reveal
        await time.increaseTo(commitDeadline + 1);

        // Reveal
        await ballot.connect(voter1).revealVote(1, secret1);
        await ballot.connect(voter2).revealVote(1, secret2);

        // Advance past reveal
        await time.increaseTo(revealDeadline + 1);
      });

      it("should be in TALLY phase", async function () {
        expect(await ballot.currentPhase()).to.equal(2);
      });

      it("should finalize the election", async function () {
        await expect(ballot.finalize())
          .to.emit(ballot, "ElectionFinalized")
          .withArgs(2, await time.latest());

        const info = await ballot.getElectionInfo();
        expect(info._isFinalized).to.be.true;
      });

      it("should return results after tally", async function () {
        const results = await ballot.getResults();
        expect(results[0].voteCount).to.equal(2); // Alice got 2 votes
        expect(results[1].voteCount).to.equal(0); // Bob got 0
      });

      it("should prevent double finalization", async function () {
        await ballot.finalize();
        await expect(ballot.finalize()).to.be.revertedWith("Ballot: already finalized");
      });
    });

    // ── Receipt Verification ──
    describe("Receipt & Verification", function () {
      it("should generate and verify receipt hash", async function () {
        await createTestElection();
        const secret = randomSecret();
        const hash = computeCommitHash(1, secret);

        const tx = await ballot.connect(voter1).commitVote(hash);
        const receipt = await tx.wait();

        // Get receipt hash from event
        const event = receipt.logs.find((l) => {
          try {
            return ballot.interface.parseLog(l)?.name === "VoteCommitted";
          } catch {
            return false;
          }
        });
        const parsed = ballot.interface.parseLog(event);
        const receiptHash = parsed.args.receiptHash;

        // Verify receipt
        expect(await ballot.verifyReceipt(voter1.address, receiptHash)).to.be.true;
        expect(await ballot.verifyReceipt(voter1.address, ethers.ZeroHash)).to.be.false;
        expect(await ballot.verifyReceipt(voter2.address, receiptHash)).to.be.false;
      });

      it("should compute commit hash correctly on-chain", async function () {
        await createTestElection();
        const secret = randomSecret();
        const offChainHash = computeCommitHash(1, secret);
        const onChainHash = await ballot.computeCommitHash(1, secret);
        expect(onChainHash).to.equal(offChainHash);
      });
    });

    // ── Admin Controls ──
    describe("Admin Controls", function () {
      it("should allow admin to cancel election", async function () {
        await createTestElection();
        await expect(ballot.connect(admin).cancelElection("Security issue"))
          .to.emit(ballot, "ElectionCancelled");

        const info = await ballot.getElectionInfo();
        expect(info._isCancelled).to.be.true;
      });

      it("should prevent voting on cancelled election", async function () {
        await createTestElection();
        await ballot.connect(admin).cancelElection("Test");

        const secret = randomSecret();
        await expect(
          ballot.connect(voter1).commitVote(computeCommitHash(1, secret))
        ).to.be.revertedWith("Ballot: election cancelled");
      });

      it("should allow extending commit deadline", async function () {
        const { commitDeadline, revealDeadline } = await createTestElection();
        const newDeadline = commitDeadline + 1800;

        await ballot.connect(admin).extendCommitDeadline(newDeadline);
        const info = await ballot.getElectionInfo();
        expect(info._commitDeadline).to.equal(newDeadline);
      });

      it("should prevent non-admin from cancelling", async function () {
        await createTestElection();
        await expect(
          ballot.connect(outsider).cancelElection("Hack")
        ).to.be.revertedWith("Ballot: only admin");
      });
    });

    // ── Constituency-Specific Election ──
    describe("Constituency Election", function () {
      it("should restrict voting to correct constituency", async function () {
        const now = await time.latest();
        const tx = await electionFactory.connect(admin).createElection(
          "Constituency 1 Election",
          "Only for constituency 1",
          now + 3600,
          now + 7200,
          ["Alice", "Bob"],
          ["Party A", "Party B"],
          1, // constituency 1 only
          1  // CONSTITUENCY type
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find((l) => {
          try {
            return electionFactory.interface.parseLog(l)?.name === "ElectionCreated";
          } catch {
            return false;
          }
        });
        const parsed = electionFactory.interface.parseLog(event);
        const Ballot = await ethers.getContractFactory("Ballot");
        const constBallot = Ballot.attach(parsed.args.ballotAddress);

        // voter1 (constituency 1) can commit
        const secret = randomSecret();
        await constBallot.connect(voter1).commitVote(computeCommitHash(1, secret));
        expect(await constBallot.totalCommits()).to.equal(1);

        // voter3 (constituency 2) cannot commit
        const secret3 = randomSecret();
        await expect(
          constBallot.connect(voter3).commitVote(computeCommitHash(1, secret3))
        ).to.be.revertedWith("Ballot: wrong constituency");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VOTE VERIFIER
  // ═══════════════════════════════════════════════════════════════
  describe("VoteVerifier", function () {
    let ballot, ballotAddress;

    beforeEach(async function () {
      // Setup voters
      await voterRegistry.connect(admin).registerVoter(voter1.address, hashIdentity("V1"), 1);
      await voterRegistry.connect(admin).registerVoter(voter2.address, hashIdentity("V2"), 1);

      // Create election
      const now = await time.latest();
      const commitDeadline = now + 3600;
      const revealDeadline = now + 7200;

      const tx = await electionFactory.connect(admin).createElection(
        "Verifier Test",
        "Testing the verifier",
        commitDeadline,
        revealDeadline,
        ["Alice", "Bob"],
        ["Party A", "Party B"],
        0, 0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => {
        try {
          return electionFactory.interface.parseLog(l)?.name === "ElectionCreated";
        } catch {
          return false;
        }
      });
      const parsed = electionFactory.interface.parseLog(event);
      ballotAddress = parsed.args.ballotAddress;

      const Ballot = await ethers.getContractFactory("Ballot");
      ballot = Ballot.attach(ballotAddress);

      // Commit & reveal
      const secret1 = randomSecret();
      const secret2 = randomSecret();
      await ballot.connect(voter1).commitVote(computeCommitHash(1, secret1));
      await ballot.connect(voter2).commitVote(computeCommitHash(2, secret2));

      await time.increaseTo(commitDeadline + 1);

      await ballot.connect(voter1).revealVote(1, secret1);
      await ballot.connect(voter2).revealVote(2, secret2);

      await time.increaseTo(revealDeadline + 1);
    });

    it("should check if voter participated", async function () {
      const result = await voteVerifier.didVoterParticipate(ballotAddress, voter1.address);
      expect(result.committed).to.be.true;
      expect(result.revealed).to.be.true;
    });

    it("should verify election integrity", async function () {
      const result = await voteVerifier.verifyElectionIntegrity(ballotAddress);
      expect(result.isIntegrous).to.be.true;
      expect(result.totalReveals).to.equal(2);
      expect(result.totalCandidateVotes).to.equal(2);
      expect(result.totalCommits).to.equal(2);
    });

    it("should get election summary", async function () {
      const summary = await voteVerifier.getElectionSummary(ballotAddress);
      expect(summary.name).to.equal("Verifier Test");
      expect(summary.totalRevealed).to.equal(2);
      expect(summary.candidateCount).to.equal(2);
    });

    it("should compute commit hash matching off-chain", async function () {
      const secret = randomSecret();
      const offChain = computeCommitHash(1, secret);
      const onChain = await voteVerifier.computeCommitHash(1, secret);
      expect(offChain).to.equal(onChain);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GAS OPTIMIZATION CHECKS
  // ═══════════════════════════════════════════════════════════════
  describe("Gas Usage", function () {
    it("should have reasonable gas for commit + reveal", async function () {
      await voterRegistry.connect(admin).registerVoter(voter1.address, hashIdentity("V1"), 1);

      const now = await time.latest();
      const tx = await electionFactory.connect(admin).createElection(
        "Gas Test", "desc", now + 3600, now + 7200,
        ["A", "B"], ["PA", "PB"], 0, 0
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => {
        try { return electionFactory.interface.parseLog(l)?.name === "ElectionCreated"; }
        catch { return false; }
      });
      const parsed = electionFactory.interface.parseLog(event);
      const Ballot = await ethers.getContractFactory("Ballot");
      const ballot = Ballot.attach(parsed.args.ballotAddress);

      const secret = randomSecret();
      const commitTx = await ballot.connect(voter1).commitVote(computeCommitHash(1, secret));
      const commitReceipt = await commitTx.wait();
      console.log("    Commit gas used:", commitReceipt.gasUsed.toString());
      expect(commitReceipt.gasUsed).to.be.lessThan(200000n);

      await time.increaseTo(now + 3601);
      const revealTx = await ballot.connect(voter1).revealVote(1, secret);
      const revealReceipt = await revealTx.wait();
      console.log("    Reveal gas used:", revealReceipt.gasUsed.toString());
      expect(revealReceipt.gasUsed).to.be.lessThan(150000n);
    });
  });
});
