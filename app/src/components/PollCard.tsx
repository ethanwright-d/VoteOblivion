import type { PollActionState, PollView, PendingResult } from './pollTypes';
import '../styles/VoteApp.css';

type PollCardProps = {
  poll: PollView;
  now: number;
  actionState?: PollActionState;
  pendingResult?: PendingResult;
  walletConnected: boolean;
  zamaReady: boolean;
  onVote: (pollId: number, optionIndex: number) => Promise<void>;
  onFinalize: (pollId: number) => Promise<void>;
  onDecrypt: (pollId: number) => Promise<void>;
  onPublish: (pollId: number) => Promise<void>;
};

const formatDate = (value: number) => new Date(value * 1000).toLocaleString();

export function PollCard({
  poll,
  now,
  actionState,
  pendingResult,
  walletConnected,
  zamaReady,
  onVote,
  onFinalize,
  onDecrypt,
  onPublish,
}: PollCardProps) {
  const isActive = now >= poll.startTime && now < poll.endTime;
  const isUpcoming = now < poll.startTime;
  const isClosed = now >= poll.endTime;
  const statusClass = poll.resultsPublished
    ? 'published'
    : poll.finalized
      ? 'finalized'
      : isActive
        ? 'active'
        : isUpcoming
          ? 'upcoming'
          : 'closed';
  const statusText = poll.resultsPublished
    ? 'Results on-chain'
    : poll.finalized
      ? 'Awaiting publish'
      : isActive
        ? 'Active'
        : isUpcoming
          ? 'Upcoming'
          : 'Closed';

  const disableVoting = !walletConnected || !zamaReady || poll.userHasVoted || !isActive || actionState?.voting;

  return (
    <div className="poll-card">
      <div className="poll-header">
        <h3 className="poll-title">{poll.name}</h3>
        <span className={`status-pill ${statusClass}`}>{statusText}</span>
      </div>

      <div className="poll-meta">
        <div className="meta-item">
          <span className="meta-label">Starts</span>
          <span>{formatDate(poll.startTime)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Ends</span>
          <span>{formatDate(poll.endTime)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Your status</span>
          <span>{poll.userHasVoted ? 'Vote recorded' : 'Not voted'}</span>
        </div>
      </div>

      <div className="options-list">
        {poll.options.map((option, index) => (
          <div key={`${poll.id}-opt-${index}`} className={`option-row ${poll.userHasVoted ? 'voted' : ''}`}>
            <div className="option-info">
              <span className="option-name">{option}</span>
              <span className="option-metadata">Choice #{index + 1}</span>
            </div>
            <button
              className="secondary-button"
              disabled={disableVoting}
              onClick={() => onVote(poll.id, index)}
            >
              {actionState?.voting ? 'Submitting...' : 'Vote'}
            </button>
          </div>
        ))}
      </div>

      {poll.finalized && !poll.resultsPublished ? (
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={actionState?.decrypting || !zamaReady}
            onClick={() => onDecrypt(poll.id)}
          >
            {actionState?.decrypting ? 'Decrypting...' : 'Decrypt tallies'}
          </button>
          <button
            className="secondary-button"
            disabled={actionState?.publishing || !pendingResult}
            onClick={() => onPublish(poll.id)}
          >
            {actionState?.publishing ? 'Publishing...' : 'Publish results'}
          </button>
        </div>
      ) : null}

      {!poll.finalized && isClosed ? (
        <div className="button-row">
          <button
            className="primary-button"
            disabled={actionState?.finalizing}
            onClick={() => onFinalize(poll.id)}
          >
            {actionState?.finalizing ? 'Finalizing...' : 'Finalize poll'}
          </button>
        </div>
      ) : null}

      {pendingResult ? (
        <div className="pending-result">
          <strong>Pending publication:</strong>
          <div className="results-grid">
            {pendingResult.counts.map((count, index) => (
              <div key={`pending-${poll.id}-${index}`} className="result-card">
                <div className="meta-label">{poll.options[index]}</div>
                <div>{count} vote(s)</div>
              </div>
            ))}
          </div>
          <p className="muted">Submit to the contract to finalize the poll.</p>
        </div>
      ) : null}

      {poll.resultsPublished && poll.publicResults.length ? (
        <div className="results-panel">
          <strong>Published results</strong>
          <div className="results-grid">
            {poll.publicResults.map((value, index) => (
              <div key={`result-${poll.id}-${index}`} className="result-card">
                <span className="meta-label">{poll.options[index]}</span>
                <span>{value} vote(s)</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
