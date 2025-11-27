import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-info">
          <h1 className="header-title">VoteOblivion</h1>
          <p className="header-subtitle">
            Fully homomorphic polls secured by Zama&apos;s relayer and verified on-chain
          </p>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
