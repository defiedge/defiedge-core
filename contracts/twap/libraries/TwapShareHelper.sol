//SPDX-License-Identifier: BSL
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";

import "./TwapOracleLibrary.sol";

library TwapShareHelper {
    using SafeMath for uint256;

    uint256 public constant DIVISOR = 100e18;

    /**
     * @dev Calculates the shares to be given for specific position
     * @param _registry Chainlink registry interface
     * @param _pool The token0
     * @param _amount0 Amount of token0
     * @param _amount1 Amount of token1
     * @param _totalAmount0 Total amount of token0
     * @param _totalAmount1 Total amount of token1
     * @param _totalShares Total Number of shares
     */
    function calculateShares(
        FeedRegistryInterface _registry,
        IUniswapV3Pool _pool,
        ITwapStrategyManager _manager,
        bool[2] memory _useTwap,
        uint256 _amount0,
        uint256 _amount1,
        uint256 _totalAmount0,
        uint256 _totalAmount1,
        uint256 _totalShares
    ) public view returns (uint256 share) {

        require(_amount0 > 0 && _amount1 > 0, 'INSUFFICIENT_AMOUNT');

        _amount0 = TwapOracleLibrary.normalise(_pool.token0(), _amount0);
        _amount1 = TwapOracleLibrary.normalise(_pool.token1(), _amount1);
        _totalAmount0 = TwapOracleLibrary.normalise(_pool.token0(), _totalAmount0);
        _totalAmount1 = TwapOracleLibrary.normalise(_pool.token1(), _totalAmount1);

        // price in USD
        uint256 token0Price = TwapOracleLibrary.getPriceInUSD(
            _pool,
            _registry,
            _pool.token0(),
            _useTwap,
            _manager
        );

        uint256 token1Price = TwapOracleLibrary.getPriceInUSD(
            _pool,
            _registry,
            _pool.token1(),
            _useTwap,
            _manager
        );

        if (_totalShares > 0) {
            
            if(_amount0 < _amount1){
                share = FullMath.mulDiv(_amount1, _totalShares, _totalAmount1);
            } else {
                share = FullMath.mulDiv(_amount0, _totalShares, _totalAmount0);
            }

        } else {
            share = ((token0Price.mul(_amount0)).add(token1Price.mul(_amount1)))
                .div(DIVISOR);
        }
    }

    /**
     * @notice Calculates the fee shares from accumulated fees
     * @param _factory Strategy factory address
     * @param _manager Strategy manager contract address
     * @param _accManagementFee Accumulated management fees in terms of shares, decimal 18
     */
    function calculateFeeShares(
        ITwapStrategyFactory _factory,
        ITwapStrategyManager _manager,
        uint256 _accManagementFee
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
        uint256 protocolFee = _factory.protocolFee();

        // calculate the fees for protocol and manager from management fees
        if (_accManagementFee > 0) {
            protocolShare = FullMath.mulDiv(
                _accManagementFee,
                protocolFee,
                1e8
            );
            managerShare = _accManagementFee.sub(
                protocolShare
            );
        }

        // moved here for saving bytecode
        managerFeeTo = _manager.feeTo();
        protocolFeeTo = _factory.feeTo();
    }

    /**
     * @notice Calculates the fee shares from accumulated fees
     * @param _factory Strategy factory address
     * @param _manager Strategy manager contract address
     * @param _fee0 Accumulated token0 fee amount
     * @param _fee1 Accumulated token1  fee amount
     */
    function calculateFeeTokenShares(
        ITwapStrategyFactory _factory,
        ITwapStrategyManager _manager,
        uint256 _fee0,
        uint256 _fee1
    )
        public
        view
        returns (
            address managerFeeTo,
            address protocolFeeTo,
            uint256 managerToken0Share,
            uint256 managerToken1Share,
            uint256 protocolToken0Share,
            uint256 protocolToken1Share
        )
    {
        // protocol fees
        uint256 protocolFee = _factory.protocolFee();

        // performance fee to manager
        uint256 performanceFee = _manager.performanceFee();

        // protocol performance fee 
        uint256 _protocolPerformanceFee = _factory.protocolPerformanceFee();

        // calculate the fees for protocol and manager from performance fees
        uint256 performanceToken0Share = FullMath.mulDiv(_fee0, performanceFee, 1e8);
        uint256 performanceToken1Share = FullMath.mulDiv(_fee1, performanceFee, 1e8);

        if(performanceToken0Share > 0){
            protocolToken0Share = FullMath.mulDiv(performanceToken0Share, protocolFee, 1e8);
            managerToken0Share = performanceToken0Share.sub(protocolToken0Share);
        }

        if(performanceToken1Share > 0){
            protocolToken1Share = FullMath.mulDiv(performanceToken1Share, protocolFee, 1e8);
            managerToken1Share = performanceToken1Share.sub(protocolToken1Share);
        }

        protocolToken0Share = protocolToken0Share.add(FullMath.mulDiv(_fee0, _protocolPerformanceFee, 1e8));
        protocolToken1Share = protocolToken1Share.add(FullMath.mulDiv(_fee1, _protocolPerformanceFee, 1e8));

        // moved here for saving bytecode
        managerFeeTo = _manager.feeTo();
        protocolFeeTo = _factory.feeTo();
    }

    function getOptimalAmounts(
        uint256 _amount0,
        uint256 _amount1,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _totalAmount0,
        uint256 _totalAmount1
    ) 
        public 
        pure
        returns(
            uint256 amount0,
            uint256 amount1
        )
    {
        require(_amount0 > 0 && _amount1 > 0, 'INSUFFICIENT_AMOUNT');

        if (_totalAmount0 == 0 && _totalAmount1 == 0) {
            (amount0, amount1) = (_amount0, _amount1);
        } else {
            uint amount1Optimal = _amount0.mul(_totalAmount1).div(_totalAmount0);
            if (amount1Optimal <= _amount1) {
                require(amount1Optimal >= _amount1Min, 'INSUFFICIENT_AMOUNT_1');
                (amount0, amount1) = (_amount0, amount1Optimal);
            } else {
                uint amount0Optimal = _amount1.mul(_totalAmount0).div(_totalAmount1);
                assert(amount0Optimal <= _amount0);
                require(amount0Optimal >= _amount0Min, 'INSUFFICIENT_AMOUNT_0');
                (amount0, amount1) = (amount0Optimal, _amount1);
            }
        }

    }
}
