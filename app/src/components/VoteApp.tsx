import { useEffect, useMemo, useState } from 'react';
import type { Abi } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Contract } from 'ethers';

import { Header } from './Header';
import { CreatePollForm, type PollFormValues } from './CreatePollForm';
import { PollCard } from './PollCard';
import type { PollActionState, PollView, PendingResult } from './pollTypes';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/VoteApp.css';

const abi = CONTRACT_ABI as unknown as Abi;

const pollQueryKey = (chainId?: number, address?: string) => ['polls', chainId, address] as const;

export function VoteApp() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [pendingResults, setPendingResults] = useState<Record<number, PendingResult>>({});
  const [actionState, setActionState] = useState<Record<number, PollActionState>>({});
  const [createLoading, setCreateLoading] = useState(false);
  const [banner, setBanner] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const pollsQuery = useQuery({
    queryKey: pollQueryKey(publicClient?.chain?.id, address),
    queryFn: async (): Promise<PollView[]> => {
      if (!publicClient) {
        return [];
      }
      const totalPolls = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: 'totalPolls',
      })) as bigint;

      const polls: PollView[] = [];
      for (let i = 0; i < Number(totalPolls); i += 1) {
        const pollId = BigInt(i);
        const metadata = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi,
          functionName: 'getPollMetadata',
          args: [pollId],
        })) as readonly [string, readonly string[], bigint, bigint, boolean, boolean];

        const publicResults = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi,
          functionName: 'getPublicResults',
          args: [pollId],
        })) as readonly bigint[];

        let hasVoted = false;
        if (address) {
          hasVoted = (await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi,
            functionName: 'hasAddressVoted',
            args: [pollId, address],
          })) as boolean;
        }

        polls.push({
          id: i,
          name: metadata[0],
          options: Array.from(metadata[1]),
          startTime: Number(metadata[2]),
          endTime: Number(metadata[3]),
          finalized: metadata[4],
          resultsPublished: metadata[5],
          publicResults: Array.from(publicResults).map(value => Number(value)),
          userHasVoted: hasVoted,
        });
      }
      return polls;
    },
    enabled: Boolean(publicClient),
    refetchInterval: 15000,
  });

  const polls = pollsQuery.data ?? [];
  const now = Math.floor(Date.now() / 1000);
  const walletConnected = Boolean(address);
  const zamaReady = Boolean(instance) && !zamaError;

  useEffect(() => {
    setPendingResults(prev => {
      const next = { ...prev };
      polls.forEach(poll => {
        if (poll.resultsPublished && next[poll.id]) {
          delete next[poll.id];
        }
      });
      return next;
    });
  }, [polls]);

  const setAction = (pollId: number, value: PollActionState) => {
    setActionState(prev => ({ ...prev, [pollId]: { ...prev[pollId], ...value } }));
  };

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 5000);
  };

  const refreshPolls = async () => {
    await queryClient.invalidateQueries({ queryKey: pollQueryKey(publicClient?.chain?.id, address) });
  };

  const ensureSigner = async () => {
    const signerInstance = await signer;
    if (!signerInstance) {
      throw new Error('Connect your wallet to continue');
    }
    return signerInstance;
  };

  const ensureInstance = () => {
    if (!instance) {
      throw new Error('Encryption service is still initializing');
    }
    return instance;
  };

  const handleCreatePoll = async (values: PollFormValues) => {
    try {
      if (!walletConnected) {
        throw new Error('Connect your wallet to create polls');
      }
      const start = Math.floor(new Date(values.start).getTime() / 1000);
      const end = Math.floor(new Date(values.end).getTime() / 1000);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        throw new Error('Select valid start and end times');
      }
      if (end <= start) {
        throw new Error('End time must be after the start time');
      }
      if (end <= Math.floor(Date.now() / 1000)) {
        throw new Error('Choose an end time in the future');
      }

      const options = values.options.map(option => option.trim()).filter(Boolean);
      if (options.length < 2) {
        throw new Error('Provide at least two options');
      }

      setCreateLoading(true);
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await ensureSigner());
      const tx = await contract.createPoll(values.name.trim(), options, BigInt(start), BigInt(end));
      await tx.wait();
      notify('Poll created successfully');
      await refreshPolls();
    } finally {
      setCreateLoading(false);
    }
  };

  const handleVote = async (pollId: number, choice: number) => {
    setAction(pollId, { voting: true });
    try {
      if (!walletConnected) {
        throw new Error('Connect your wallet to vote');
      }
      const zama = ensureInstance();
      const encryptedBuffer = zama.createEncryptedInput(CONTRACT_ADDRESS, address!);
      encryptedBuffer.add32(choice);
      const encrypted = await encryptedBuffer.encrypt();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await ensureSigner());
      const tx = await contract.vote(BigInt(pollId), encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      notify('Vote submitted');
      await refreshPolls();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit vote';
      notify(message, 'error');
    } finally {
      setAction(pollId, { voting: false });
    }
  };

  const handleFinalize = async (pollId: number) => {
    setAction(pollId, { finalizing: true });
    try {
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await ensureSigner());
      const tx = await contract.finalizePoll(BigInt(pollId));
      await tx.wait();
      notify('Poll finalized');
      await refreshPolls();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to finalize poll';
      notify(message, 'error');
    } finally {
      setAction(pollId, { finalizing: false });
    }
  };

  const handleDecrypt = async (pollId: number) => {
    if (!publicClient) return;
    setAction(pollId, { decrypting: true });
    try {
      const zama = ensureInstance();
      const handles = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi,
        functionName: 'getEncryptedTallies',
        args: [BigInt(pollId)],
      })) as readonly string[];

      const result = await zama.publicDecrypt(handles);
      const counts = handles.map(handle => {
        const value = result.clearValues[handle as `0x${string}`];
        return value ? Number(value) : 0;
      });

      setPendingResults(prev => ({
        ...prev,
        [pollId]: { counts, proof: result.decryptionProof, handles: Array.from(handles) },
      }));
      notify('Tallies decrypted. Publish them on-chain to finalize.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to decrypt tallies';
      notify(message, 'error');
    } finally {
      setAction(pollId, { decrypting: false });
    }
  };

  const handlePublish = async (pollId: number) => {
    const pending = pendingResults[pollId];
    if (!pending) return;
    setAction(pollId, { publishing: true });
    try {
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await ensureSigner());
      const payload = pending.counts.map(value => BigInt(value));
      const tx = await contract.publishResults(BigInt(pollId), payload, pending.proof);
      await tx.wait();
      notify('Results anchored on-chain');
      setPendingResults(prev => {
        const next = { ...prev };
        delete next[pollId];
        return next;
      });
      await refreshPolls();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to publish results';
      notify(message, 'error');
    } finally {
      setAction(pollId, { publishing: false });
    }
  };

  const zamaIndicator = useMemo(() => {
    if (zamaError) {
      return { text: 'Encryption unavailable', color: '#ef4444' };
    }
    if (zamaLoading || !instance) {
      return { text: 'Initializing encryption relayer…', color: '#fbbf24' };
    }
    return { text: 'Encryption ready', color: '#34d399' };
  }, [zamaError, zamaLoading, instance]);

  return (
    <div className="vote-app">
      <Header />

      {banner ? (
        <div className={`info-banner ${banner.type === 'error' ? 'error' : 'success'}`}>{banner.text}</div>
      ) : null}

      <div className="status-row">
        <div className="zama-indicator">
          <span className="status-dot" style={{ backgroundColor: zamaIndicator.color }} />
          {zamaIndicator.text}
        </div>
        {!walletConnected ? <span className="muted">Connect your wallet to vote or create polls.</span> : null}
      </div>

      <div className="layout-grid">
        <div className="section-card">
          <h2 className="section-title">Create a confidential poll</h2>
          <p className="section-description">
            Define the question, set a time window, and let VoteOblivion manage encrypted tallies end-to-end.
          </p>
          <CreatePollForm onSubmit={handleCreatePoll} isSubmitting={createLoading} />
        </div>

        <div className="section-card">
          <h2 className="section-title">Polls</h2>
          <p className="section-description">
            Vote while the poll is active, finalize after the deadline, decrypt tallies, and publish them with a proof.
          </p>

          {pollsQuery.isLoading ? (
            <div className="empty-state">Loading polls from the chain...</div>
          ) : polls.length === 0 ? (
            <div className="empty-state">No polls yet. Be the first to create one.</div>
          ) : (
            <div className="poll-list">
              {polls.map(poll => (
                <PollCard
                  key={`poll-${poll.id}`}
                  poll={poll}
                  now={now}
                  walletConnected={walletConnected}
                  zamaReady={zamaReady}
                  actionState={actionState[poll.id]}
                  pendingResult={pendingResults[poll.id]}
                  onVote={handleVote}
                  onFinalize={handleFinalize}
                  onDecrypt={handleDecrypt}
                  onPublish={handlePublish}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
