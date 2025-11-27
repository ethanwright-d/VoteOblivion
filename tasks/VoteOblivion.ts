import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:poll-address", "Prints the VoteOblivion contract address").setAction(async (_args: TaskArguments, hre) => {
  const deployment = await hre.deployments.get("VoteOblivion");
  console.log(`VoteOblivion address: ${deployment.address}`);
});

task("task:poll-list", "Lists poll metadata").setAction(async (_args: TaskArguments, hre) => {
  const { ethers } = hre;
  const reader = await ethers.getContract("VoteOblivion");
  const total = await reader.totalPolls();
  console.log(`Total polls: ${total}`);
  for (let i = 0n; i < total; i++) {
    const [name, options, start, end, finalized, resultsPublished] = await reader.getPollMetadata(i);
    console.log(
      [
        `#${i.toString()}: ${name}`,
        `options=${(options as string[]).join(" | ")}`,
        `window=${start} -> ${end}`,
        `finalized=${finalized}`,
        `results=${resultsPublished}`,
      ].join(" | "),
    );
  }
});

task("task:poll-create", "Creates a poll")
  .addParam("name", "Poll name")
  .addParam("options", "Comma separated option labels")
  .addParam("start", "Start timestamp (seconds)")
  .addParam("end", "End timestamp (seconds)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const signers = await ethers.getSigners();
    const voteOblivion = await ethers.getContract("VoteOblivion", signers[0]);

    const options = String(args.options)
      .split(",")
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);

    const start = BigInt(args.start);
    const end = BigInt(args.end);

    const tx = await voteOblivion.createPoll(args.name, options, start, end);
    const receipt = await tx.wait();
    console.log(`Created poll tx=${tx.hash} status=${receipt?.status}`);
  });

task("task:poll-vote", "Encrypts a choice and casts a vote")
  .addParam("poll", "Poll id")
  .addParam("choice", "Plain option index (0-based) to encrypt before sending")
  .setAction(async (args: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VoteOblivion");
    const pollId = BigInt(args.poll);
    const choice = parseInt(String(args.choice), 10);
    if (!Number.isInteger(choice)) {
      throw new Error("Choice must be an integer index");
    }

    const signers = await ethers.getSigners();
    const voteOblivion = await ethers.getContractAt("VoteOblivion", deployment.address);

    const encryptedChoice = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add32(choice)
      .encrypt();

    const tx = await voteOblivion
      .connect(signers[0])
      .vote(pollId, encryptedChoice.handles[0], encryptedChoice.inputProof);

    const receipt = await tx.wait();
    console.log(`Vote tx=${tx.hash} status=${receipt?.status}`);
  });

task("task:poll-tallies", "Reads encrypted tallies for a poll")
  .addParam("poll", "Poll id")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const reader = await ethers.getContract("VoteOblivion");
    const tallies = await reader.getEncryptedTallies(BigInt(args.poll));
    tallies.forEach((handle: string, index: number) => {
      console.log(`option[${index}] handle=${handle}`);
    });
  });

task("task:poll-finalize", "Marks a poll as finalized and makes tallies public")
  .addParam("poll", "Poll id")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const signers = await ethers.getSigners();
    const voteOblivion = await ethers.getContract("VoteOblivion", signers[0]);
    const tx = await voteOblivion.finalizePoll(BigInt(args.poll));
    const receipt = await tx.wait();
    console.log(`Finalize tx=${tx.hash} status=${receipt?.status}`);
  });

task("task:poll-publish", "Publishes decrypted tallies with the provided proof")
  .addParam("poll", "Poll id")
  .addParam("results", "Comma separated uint64 results")
  .addParam("proof", "Gateway proof hex string")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const signers = await ethers.getSigners();
    const voteOblivion = await ethers.getContract("VoteOblivion", signers[0]);

    const results = String(args.results)
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => BigInt(entry));

    const proof = String(args.proof);
    const tx = await voteOblivion.publishResults(BigInt(args.poll), results, proof);
    const receipt = await tx.wait();
    console.log(`Publish tx=${tx.hash} status=${receipt?.status}`);
  });

task("task:poll-decrypt", "Decrypts a tally locally (mock only)")
  .addParam("poll", "Poll id")
  .addParam("option", "Option index")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VoteOblivion");
    const reader = await ethers.getContractAt("VoteOblivion", deployment.address);
    const tallies = await reader.getEncryptedTallies(BigInt(args.poll));
    const idx = Number(args.option);
    const encrypted = tallies[idx];

    const signers = await ethers.getSigners();
    const clear = await fhevm.userDecryptEuint(FhevmType.euint32, encrypted, deployment.address, signers[0]);
    console.log(`Decrypted count for option ${idx}: ${clear}`);
  });
