//SPDX-License-Identifier: BSL
pragma solidity ^0.7.6;

contract ChainlinkRegistryMock {
    uint8 _decimals;
    int256 _answer;

    address token0;
    address token1;

    int256 token0Answer;
    int256 token1Answer;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function decimals(address base, address quote)
        external
        view
        returns (uint8)
    {
        return _decimals;
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
        updatedAt = block.timestamp;
        if (
            base == token1 &&
            quote == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
        ) {
            answer = (token1Answer * 10**8) / token0Answer;
        } else if (base == token0) {
            answer = token0Answer;
        } else if (base == token1) {
            answer = token1Answer;
        } else if (base == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            // answer = 99 * 10e5;
            answer = token0Answer;
        } else {
            require(1 != 1, "erro");
        }
    }

    function setDecimals(uint8 _newDecimals) external {
        _decimals = _newDecimals;
    }

    function setAnswer(int256 _token0Answer, int256 _token1Answer) external {
        token0Answer = _token0Answer;
        token1Answer = _token1Answer;
    }
}
