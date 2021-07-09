const {expect} = require('chai');

describe ("StrategyFactory contract", function () {
    let StratagyFactory , DefiEdgeStrategy, total, _poolAddress, _operatorAddress, _aggregator, _stratagy;

    beforeEach (async function() {
        StratagyFactory = await ethers.getContractFactory('StrategyFactory');
        DefiEdgeStrategy = await ethers.getContractFactory('DefiEdgeStrategy');
        [total,_poolAddress,_operatorAddress,_aggregator,_] = await ethers.getSigners();
        total = await StratagyFactory.deploy(_aggregator.address);
        _stratagy = await DefiEdgeStrategy.deploy(_aggregator.address,_poolAddress.address,_operatorAddress.address)
    });

    describe ('Deployment Function', function () {

        it('Aggregator is matching with aggregator address',async function () {
                expect(await total.aggregator()).to.equal(_aggregator.address);
        });
        it ('total Value before entering is 0',async function () {
            expect(await total.total()).to.equal(0);
        });
    });

    describe ('CreateStratagy Function', function () {
        it ('Expected to raise the value to total by 1', async  function(){
                await total.createStrategy(_poolAddress.address,_operatorAddress.address);
                expect(await total.total()).to.equal(1);
        });
        it ('Expected to return the  strategy', async  function(){
            await total.createStrategy(_poolAddress.address,_operatorAddress.address);
            const data = await total.strategyByIndex(total.total());
            expect(data).to.equal(await total.strategyByIndex(total.total()));
        });
        it ('Expected to return true or false', async  function(){
            await total.createStrategy(_poolAddress.address,_operatorAddress.address);
            const data = await total.strategyByIndex(total.total());
            const truth = await total.isValid(data);
            expect (truth).to.equal(true);
        });
    });

    // describe ('Events', function () {
    //     it ('should match with the strategy address', async function(){
    //         await total.createStrategy(_poolAddress.address,_operatorAddress.address);
    //         const Strategy_address= await _stratagy.address;
    //         const data = await total.strategyByIndex(total.total());
    //         expect (data).to.equal(Strategy_address);
    //     })
    // })
});