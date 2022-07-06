//SPDX-License-Identifier: BSL
pragma solidity =0.7.6;

interface IAggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract ChainlinkRegistry {
    /// map base currencies with quote currencies
    mapping(address => mapping(address => address)) public feeds;

    address public governance;
    address public pendingGovernance;

    constructor(address _governance) {
        governance = _governance;
    }

    function latestRoundData(address base, address quote)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        IAggregatorV3Interface feed = IAggregatorV3Interface(
            feeds[base][quote]
        );
        (roundId, answer, startedAt, updatedAt, answeredInRound) = feed
            .latestRoundData();
    }

    function setFeed(
        address _feed,
        address _base,
        address _quote
    ) external {
        require(msg.sender == governance, "not allowed");
        feeds[_base][_quote] = _feed;
    }

    function decimals(address _base, address _quote)
        public
        view
        returns (uint8)
    {
        return IAggregatorV3Interface(feeds[_base][_quote]).decimals();
    }

    function changeGovernance(address _governance) external {
        require(msg.sender == governance, "not allowed");
        pendingGovernance = _governance;
    }

    function acceptGovernance() external {
        require(msg.sender == pendingGovernance);
        governance = pendingGovernance;
    }
}
