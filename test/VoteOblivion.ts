import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { VoteOblivion, VoteOblivion__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VoteOblivion", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let voteOblivion: VoteOblivion;
  let contractAddress: string;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("Skipping VoteOblivion tests outside the mock FHEVM");
      this.skip();
    }

    [deployer, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const factory = (await ethers.getContractFactory("VoteOblivion")) as VoteOblivion__factory;
    voteOblivion = (await factory.deploy()) as VoteOblivion;
    contractAddress = await voteOblivion.getAddress();
  });

  async function createDefaultPoll() {
    const now = BigInt(await time.latest());
    const start = now + 5n;
    const end = start + 60n;
    const tx = await voteOblivion.createPoll("Weekly poll", ["Alice", "Bob"], start, end);
    await tx.wait();
    return { pollId: 0n, start, end };
  }

  async function castVote(pollId: bigint, signer: HardhatEthersSigner, choice: number) {
    const encryptedChoice = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add32(choice)
      .encrypt();

    const tx = await voteOblivion.connect(signer).vote(pollId, encryptedChoice.handles[0], encryptedChoice.inputProof);
    await tx.wait();
  }

  it("creates a poll and exposes metadata", async function () {
    const { pollId, start, end } = await createDefaultPoll();
    const [name, options, recordedStart, recordedEnd, finalized, resultsPublished] =
      await voteOblivion.getPollMetadata(pollId);

    expect(name).to.eq("Weekly poll");
    expect(options).to.deep.eq(["Alice", "Bob"]);
    expect(recordedStart).to.eq(start);
    expect(recordedEnd).to.eq(end);
    expect(finalized).to.eq(false);
    expect(resultsPublished).to.eq(false);
    expect(await voteOblivion.totalPolls()).to.eq(1n);
  });

  it("increments encrypted tallies when users vote", async function () {
    const { pollId, start, end } = await createDefaultPoll();
    await time.increaseTo(start);

    await castVote(pollId, alice, 0);
    await castVote(pollId, bob, 1);

    await time.increaseTo(end + 1n);
    await voteOblivion.finalizePoll(pollId);

    const tallies = await voteOblivion.getEncryptedTallies(pollId);

    const firstOptionCount = await fhevm.publicDecryptEuint(FhevmType.euint32, tallies[0]);
    const secondOptionCount = await fhevm.publicDecryptEuint(FhevmType.euint32, tallies[1]);

    expect(firstOptionCount).to.eq(1);
    expect(secondOptionCount).to.eq(1);
  });

  it("prevents double voting per address", async function () {
    const { pollId, start } = await createDefaultPoll();
    await time.increaseTo(start);

    await castVote(pollId, alice, 0);

    const encryptedChoice = await fhevm
      .createEncryptedInput(contractAddress, alice.address)
      .add32(1)
      .encrypt();

    await expect(
      voteOblivion.connect(alice).vote(pollId, encryptedChoice.handles[0], encryptedChoice.inputProof),
    )
      .to.be.revertedWithCustomError(voteOblivion, "AddressAlreadyVoted")
      .withArgs(pollId, alice.address);
  });

  it("finalizes after the poll window", async function () {
    const { pollId, end } = await createDefaultPoll();
    await expect(voteOblivion.finalizePoll(pollId)).to.be.revertedWithCustomError(voteOblivion, "PollStillActive");

    await time.increaseTo(end + 1n);
    await expect(voteOblivion.finalizePoll(pollId)).to.emit(voteOblivion, "PollFinalized");

    const [, , , , finalized] = await voteOblivion.getPollMetadata(pollId);
    expect(finalized).to.eq(true);
  });

  it("publishes cleartext results on-chain after finalization", async function () {
    const { pollId, start, end } = await createDefaultPoll();
    await time.increaseTo(start);
    await castVote(pollId, alice, 0);
    await castVote(pollId, bob, 0);

    await time.increaseTo(end + 1n);
    await voteOblivion.finalizePoll(pollId);

    const publishTx = await voteOblivion.publishResults(pollId, [2n, 0n], "0x");
    await publishTx.wait();

    const results = await voteOblivion.getPublicResults(pollId);
    expect(results).to.deep.eq([2n, 0n]);
  });
});
