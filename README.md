# VoteOblivion

VoteOblivion is a privacy-preserving voting dApp built on Zama's FHEVM. Polls have 2–4 options and fixed voting windows. Every ballot is encrypted end-to-end, tallies stay confidential until the poll closes, and anyone can finalize a poll, decrypt the tallies with a gateway proof, and publish the cleartext results on-chain.

## Why VoteOblivion
- Confidential ballots: votes are encrypted with FHE; intermediate tallies cannot be decrypted before the deadline.
- Trust-minimized tallying: any account can finalize and publish results with KMS/Gateway signatures, eliminating a trusted operator.
- Verifiable lifecycle: poll creation, vote casting, finalization, and result publication are all on-chain with explicit events.
- Built for Ethereum tooling: Hardhat, TypeScript, viem for reads, ethers for writes, RainbowKit/wagmi for wallets, and Zama's relayer SDK for encryption/decryption.
- Production-ready flows: guards against double voting, enforces time windows, and exposes public results only after publication.

## Problems Solved
- Prevents premature result leaks that skew voter behavior by keeping tallies encrypted until the poll ends.
- Removes the need for an off-chain tallying committee; proofs from the KMS/Gateway attest to published results.
- Provides a reproducible template for FHE-powered governance or surveys on EVM chains.
- Maintains user privacy while preserving on-chain auditability and replayable events.

## Key Capabilities
- Create polls with 2–4 options, start and end timestamps, and named questions.
- Cast encrypted votes using Zama's relayer; each address can vote once per poll.
- Finalize polls after their end time to make tallies publicly decryptable.
- Decrypt tallies via the relayer and publish verified cleartext counts on-chain.
- View per-option published results, pending decrypted tallies, and participant status in the UI.
- Automate operations through Hardhat tasks for scripting and CI.

## Architecture and Stack
- **Smart contract**: `contracts/VoteOblivion.sol` (Solidity 0.8.27), relies on `@fhevm/solidity` and Zama config, uses custom errors/events, and disallows address lookups inside view functions.
- **Tooling**: Hardhat + hardhat-deploy, ethers v6 for writes, viem for reads, TypeScript typegen, Solidity coverage and gas reporter.
- **Relayer**: `@zama-fhe/relayer-sdk` drives encrypted inputs and public decryption (see `docs/zama_doc_relayer.md` and `docs/zama_llm.md`).
- **Frontend** (`app/`): React + Vite + TypeScript, RainbowKit/wagmi for wallets, viem for reads, ethers for writes, CSS (no Tailwind), and no frontend environment variables.
- **Deployments**: Hardhat artifacts in `deployments/hardhat` and `deployments/sepolia`; frontend ABI and address must come from `deployments/sepolia/VoteOblivion.json`.
- **Tasks**: `tasks/VoteOblivion.ts` automates create, vote, finalize, decrypt, and publish operations.
- **Tests**: `test/VoteOblivion.ts` covers poll lifecycle on the FHEVM mock network.

## Repository Layout
- `contracts/` — VoteOblivion Solidity contract.
- `deploy/` — hardhat-deploy script for VoteOblivion.
- `tasks/` — Hardhat tasks (address lookup, create/vote/finalize/publish/decrypt).
- `deployments/` — deployment outputs for hardhat and Sepolia (source of truth for the ABI).
- `app/` — frontend (React + Vite + wagmi/viem + ethers writes).
- `docs/` — Zama FHE protocol and relayer guides used by this project.

## Prerequisites
- Node.js v20+ and npm.
- Access to a Sepolia RPC (INFURA_API_KEY) and a funded deployer private key (hex string). MNEMONIC is not supported.
- A browser wallet configured for Sepolia to use the frontend (frontend must not point to localhost).

## Setup

### Install dependencies
```bash
# Contracts and tasks
npm install

# Frontend
cd app && npm install
```

### Configure environment (root `.env`)
```
INFURA_API_KEY=your_infura_project_id
PRIVATE_KEY=0xYourDeployerPrivateKey   # hex string, no mnemonic
ETHERSCAN_API_KEY=optional_for_verification
```

### Contract workflow
- Compile: `npm run compile`
- Test (FHE mock only): `npm run test`
- Coverage: `npm run coverage`
- Local dev node: `npm run chain` (Hardhat FHEVM mock), then `npm run deploy:localhost`
- Sepolia deploy: `npm run deploy:sepolia` (uses INFURA_API_KEY and PRIVATE_KEY); optional verify with `npm run verify:sepolia`
- After deploying to Sepolia, copy the generated ABI and address from `deployments/sepolia/VoteOblivion.json` into `app/src/config/contracts.ts`. The frontend does not use environment variables, so keep this file in sync with on-chain deployments and never hand-write an ABI.

### Hardhat tasks (examples)
- Poll address: `npx hardhat task:poll-address --network sepolia`
- List polls: `npx hardhat task:poll-list --network sepolia`
- Create poll: `npx hardhat task:poll-create --network sepolia --name "Budget" --options "Yes,No" --start 1730000000 --end 1730003600`
- Vote with encrypted choice: `npx hardhat task:poll-vote --network sepolia --poll 0 --choice 1`
- Finalize: `npx hardhat task:poll-finalize --network sepolia --poll 0`
- Publish results (after decrypting via relayer): `npx hardhat task:poll-publish --network sepolia --poll 0 --results "12,8" --proof 0x...`

### Frontend workflow (`app/`)
1. Ensure `app/src/config/contracts.ts` reflects the latest Sepolia deployment (address and ABI from `deployments/sepolia/VoteOblivion.json`).
2. Start the UI: `npm run dev` (in `app/`).
3. Connect a Sepolia wallet via RainbowKit.
4. Create a poll (2–4 options, future start/end). Writes use ethers; reads use viem.
5. While active, cast an encrypted vote (relayer handles encryption).
6. After the end time, finalize the poll, decrypt tallies via the relayer, and publish results on-chain with the provided proof.
7. Published results appear in the UI and can be independently verified on-chain.

### On-chain lifecycle
1. **Create** — `createPoll(name, options[2-4], startTime, endTime)`; emits `PollCreated`.
2. **Vote** — `vote(pollId, encryptedChoice, proof)`; enforces one vote per address and active window; updates encrypted tallies.
3. **Finalize** — `finalizePoll(pollId)` after end time; marks tallies as publicly decryptable; emits `PollFinalized`.
4. **Decrypt off-chain** — relayer decrypts tallies and returns clear counts plus KMS/Gateway proof.
5. **Publish** — `publishResults(pollId, clearResults[], proof)` anchors cleartext results and emits `ResultsPublished`.

## Advantages in Practice
- **Privacy-first governance**: prevents vote buying and intimidation by hiding interim results.
- **Auditability**: deterministic smart contract logic with verifiable proofs for published tallies.
- **Interoperability**: standard ethers/viem interfaces, Hardhat tasks, and RainbowKit integration.
- **Deterministic UI**: no mock data; every screen reflects on-chain state and relayer responses.

## Future Roadmap
- Hardened proof UX: richer status around KMS/Gateway verification and failure handling.
- Analytics: historical poll archives, winner detection, and optional CSV export of published tallies.
- Notifications: wallet or email hooks for poll start/end/finalization events.
- Multi-network readiness: parameterized configs for additional FHEVM-supported testnets or rollups.
- Accessibility and UI polish: keyboard shortcuts, improved responsive layouts, and richer empty states.

## Reference Docs
- Zama FHE contract guidance: `docs/zama_llm.md`
- Zama relayer SDK usage: `docs/zama_doc_relayer.md`

## License
Licensed under BSD-3-Clause-Clear. See `LICENSE`.
