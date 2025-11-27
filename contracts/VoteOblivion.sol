// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title VoteOblivion
 * @notice Enables creating and finalizing time‑boxed polls whose tallies remain encrypted until the poll ends.
 * Users vote with Zama encrypted choices, anyone can finalize a poll to make tallies publicly decryptable,
 * and the community can publish verified cleartext results on-chain with KMS signatures.
 */
contract VoteOblivion is ZamaEthereumConfig {
    struct Poll {
        string name;
        string[] options;
        uint64 startTime;
        uint64 endTime;
        bool finalized;
        bool resultsPublished;
        uint64[] clearResults;
        euint32[] tallies;
    }

    error PollNotFound(uint256 pollId);
    error EmptyName();
    error InvalidSchedule();
    error InvalidOptionCount();
    error PollAlreadyFinalized(uint256 pollId);
    error PollNotFinalized(uint256 pollId);
    error PollStillActive(uint256 pollId);
    error PollAlreadyPublished(uint256 pollId);
    error AddressAlreadyVoted(uint256 pollId, address voter);
    error PollNotActive(uint256 pollId);

    event PollCreated(uint256 indexed pollId, string name, string[] options, uint64 startTime, uint64 endTime);
    event VoteCast(uint256 indexed pollId, address indexed voter);
    event PollFinalized(uint256 indexed pollId);
    event ResultsPublished(uint256 indexed pollId, uint64[] results);

    uint256 private _pollCount;
    mapping(uint256 => Poll) private _polls;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    /**
     * @notice Returns number of polls.
     */
    function totalPolls() external view returns (uint256) {
        return _pollCount;
    }

    /**
     * @notice Creates a new poll with between two and four options.
     * @param name poll name
     * @param options option labels
     * @param startTime when voting can start
     * @param endTime when voting stops
     */
    function createPoll(
        string calldata name,
        string[] calldata options,
        uint64 startTime,
        uint64 endTime
    ) external returns (uint256 pollId) {
        if (bytes(name).length == 0) {
            revert EmptyName();
        }
        if (options.length < 2 || options.length > 4) {
            revert InvalidOptionCount();
        }
        if (endTime <= startTime || endTime <= block.timestamp) {
            revert InvalidSchedule();
        }

        pollId = _pollCount;
        _pollCount += 1;

        Poll storage poll = _polls[pollId];
        poll.name = name;
        poll.startTime = startTime;
        poll.endTime = endTime;

        for (uint256 i = 0; i < options.length; i++) {
            poll.options.push(options[i]);
            poll.tallies.push(FHE.asEuint32(0));
            FHE.allowThis(poll.tallies[i]);
        }

        emit PollCreated(pollId, name, options, startTime, endTime);
    }

    /**
     * @notice Cast an encrypted vote for a poll.
     * @param pollId target poll
     * @param encryptedChoice encrypted choice index
     * @param inputProof relayer proof
     */
    function vote(
        uint256 pollId,
        externalEuint32 encryptedChoice,
        bytes calldata inputProof
    ) external {
        Poll storage poll = _getPoll(pollId);
        if (block.timestamp < poll.startTime || block.timestamp >= poll.endTime) {
            revert PollNotActive(pollId);
        }
        if (_hasVoted[pollId][msg.sender]) {
            revert AddressAlreadyVoted(pollId, msg.sender);
        }

        euint32 choice = FHE.fromExternal(encryptedChoice, inputProof);
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);

        for (uint256 i = 0; i < poll.tallies.length; i++) {
            euint32 optionIndex = FHE.asEuint32(uint32(i));
            ebool matches = FHE.eq(choice, optionIndex);
            euint32 increment = FHE.select(matches, one, zero);
            poll.tallies[i] = FHE.add(poll.tallies[i], increment);
            FHE.allowThis(poll.tallies[i]);
        }

        _hasVoted[pollId][msg.sender] = true;

        emit VoteCast(pollId, msg.sender);
    }

    /**
     * @notice Finalizes a poll after end time and makes tallies publicly decryptable.
     */
    function finalizePoll(uint256 pollId) external {
        Poll storage poll = _getPoll(pollId);
        if (block.timestamp < poll.endTime) {
            revert PollStillActive(pollId);
        }
        if (poll.finalized) {
            revert PollAlreadyFinalized(pollId);
        }

        for (uint256 i = 0; i < poll.tallies.length; i++) {
            FHE.makePubliclyDecryptable(poll.tallies[i]);
        }

        poll.finalized = true;
        emit PollFinalized(pollId);
    }

    /**
     * @notice Publishes verified cleartext tallies on-chain.
     * @param pollId poll identifier
     * @param clearResults final tallies for each option
     * @param decryptionProof proof signed by the KMS validators
     */
    function publishResults(
        uint256 pollId,
        uint64[] calldata clearResults,
        bytes calldata decryptionProof
    ) external {
        Poll storage poll = _getPoll(pollId);
        if (!poll.finalized) {
            revert PollNotFinalized(pollId);
        }
        if (poll.resultsPublished) {
            revert PollAlreadyPublished(pollId);
        }
        if (clearResults.length != poll.tallies.length) {
            revert InvalidOptionCount();
        }

        bytes32[] memory handles = new bytes32[](poll.tallies.length);
        for (uint256 i = 0; i < poll.tallies.length; i++) {
            handles[i] = euint32.unwrap(poll.tallies[i]);
        }

        bytes memory cleartextPayload = abi.encodePacked(clearResults);
        // Local mock network (chain id 31337) cannot produce Gateway proofs, so allow empty proof there.
        bool shouldVerify = !(block.chainid == 31337 && decryptionProof.length == 0);
        if (shouldVerify) {
            FHE.checkSignatures(handles, cleartextPayload, decryptionProof);
        }

        delete poll.clearResults;
        for (uint256 i = 0; i < clearResults.length; i++) {
            poll.clearResults.push(clearResults[i]);
        }

        poll.resultsPublished = true;
        emit ResultsPublished(pollId, clearResults);
    }

    /**
     * @notice Returns metadata for a poll.
     */
    function getPollMetadata(
        uint256 pollId
    )
        external
        view
        returns (
            string memory name,
            string[] memory options,
            uint64 startTime,
            uint64 endTime,
            bool finalized,
            bool resultsPublished
        )
    {
        Poll storage poll = _getPoll(pollId);
        name = poll.name;
        startTime = poll.startTime;
        endTime = poll.endTime;
        finalized = poll.finalized;
        resultsPublished = poll.resultsPublished;
        options = _copyOptions(poll.options);
    }

    /**
     * @notice Returns encrypted tallies handles for a poll.
     */
    function getEncryptedTallies(uint256 pollId) external view returns (euint32[] memory tallies) {
        Poll storage poll = _getPoll(pollId);
        tallies = new euint32[](poll.tallies.length);
        for (uint256 i = 0; i < poll.tallies.length; i++) {
            tallies[i] = poll.tallies[i];
        }
    }

    /**
     * @notice Returns public cleartext results if published.
     */
    function getPublicResults(uint256 pollId) external view returns (uint64[] memory results) {
        Poll storage poll = _getPoll(pollId);
        results = _copyUint64Array(poll.clearResults);
    }

    /**
     * @notice Checks whether an address has voted in a poll.
     */
    function hasAddressVoted(uint256 pollId, address account) external view returns (bool) {
        if (pollId >= _pollCount) {
            return false;
        }
        return _hasVoted[pollId][account];
    }

    function _getPoll(uint256 pollId) private view returns (Poll storage poll) {
        if (pollId >= _pollCount) {
            revert PollNotFound(pollId);
        }
        poll = _polls[pollId];
    }

    function _copyOptions(string[] storage stored) private view returns (string[] memory copy) {
        copy = new string[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            copy[i] = stored[i];
        }
    }

    function _copyUint64Array(uint64[] storage stored) private view returns (uint64[] memory copy) {
        copy = new uint64[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            copy[i] = stored[i];
        }
    }
}
