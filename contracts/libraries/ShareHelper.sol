//SPDX-License-Identifier: BSL
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@openzeppelin/contracts/math/Math.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "./OracleLibrary.sol";

library ShareHelper {
    using SafeMath for uint256;

    uint256 public constant BASE = 1e18;

    /**
     * @notice Normalise token to 18 decimals
     * @param _token Address of the token
     * @param _amount Value to be normalised
     */
    function normalise(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        return uint256(_amount) * (10**(18 - IERC20Minimal(_token).decimals()));
    }

    /**
     * @dev Calculates the shares to be given for specific position
     * @param _registry Chainlink registry
     * @param _pool The token0
     * @param _isBase Is USD used as base
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     * @param _totalShares Total Number of shares
     */
    function calculateShares(
        address _registry,
        address _pool,
        bool[] memory _isBase,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        uint256 _totalShares
    ) public view returns (uint256 share) {
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);

        _amount0 = normalise(pool.token0(), _amount0);
        _amount1 = normalise(pool.token1(), _amount1);
        _totalAmount0 = normalise(pool.token0(), _totalAmount0);
        _totalAmount1 = normalise(pool.token1(), _totalAmount1);

        // price in USD
        uint256 token0Price = OracleLibrary.getPriceInUSD(
            _registry,
            pool.token0(),
            _isBase[0]
        );

        uint256 token1Price = OracleLibrary.getPriceInUSD(
            _registry,
            pool.token1(),
            _isBase[1]
        );

        if (_totalShares > 0) {
            uint256 numerator = (token0Price.mul(_amount0)).add(
                token1Price.mul(_amount1)
            );

            uint256 denominator = (token0Price.mul(_totalAmount0)).add(
                token1Price.mul(_totalAmount1)
            );

            share = numerator.mul(_totalShares).div(denominator);
        } else {
            share = ((token0Price.mul(_amount0)).add(token1Price.mul(_amount1)))
                .div(100 * 1e18);
        }
    }

    /**
     * @notice Calculates the fee shares from accumulated fees
     * @param _factory Strategy factory address
     * @param _manager Strategy manager contract address
     * @param _accManagementFee Accumulated management fees in terms of shares
     * @param _accPerformanceFee Accumulated performance fee in terms of shares
     */
    function calculateFeeShares(
        address _factory,
        address _manager,
        uint256 _accManagementFee,
        uint256 _accPerformanceFee
    )
        public
        view
        returns (
            address managerFeeTo,
            address protocolFeeTo,
            uint256 managerShare,
            uint256 protocolShare
        )
    {
        IStrategyFactory factory = IStrategyFactory(_factory);
        IStrategyManager manager = IStrategyManager(_manager);

        uint256 managementProtocolShare;
        uint256 managementManagerShare;

        // calculate the fees for protocol and manager from management fees
        if (_accManagementFee > 0) {
            managementProtocolShare = _accManagementFee.mul(
                factory.protocolFee()
            ).div(1e8);
            managementManagerShare = _accManagementFee.sub(
                managementProtocolShare
            );
        }

        // calculate the fees for protocol and manager from performance fees
        if (_accPerformanceFee > 0) {
            protocolShare = _accPerformanceFee.mul(factory.protocolFee()).div(1e8);
            managerShare = _accPerformanceFee.sub(protocolShare);
        }

        managerShare = managementManagerShare.add(managerShare);
        protocolShare = managementProtocolShare.add(protocolShare);

        // moved here for saving bytecode
        managerFeeTo = manager.feeTo();
        protocolFeeTo = factory.feeTo();
    }
}
