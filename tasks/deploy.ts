import { task } from 'hardhat/config';
import { deployContract } from './utils';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { erc20Abi } from '../abi/erc20';
import { erc721Abi } from '../abi/erc721';
require('dotenv').config();

const WETH_ADDRESS = undefined; // todo: change this to the address of WETH contract;

let mock721Address1 = '';
let mock721Address2 = '';
let mock721Address3 = '';
let mock20Address = '';
let nftTokenAddress = '';

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = MONTH * 12;
const UNIT = toBN(1e18);
const INFLATION = toBN(300_000_000).mul(UNIT); // 40m
const EPOCH_DURATION = YEAR;
const CLIFF = toBN(3);
const CLIFF_PERIOD = CLIFF.mul(YEAR);
const MAX_EPOCHS = 6;
const TIMELOCK = 30 * DAY;
const INITIAL_SUPPLY = toBN(1_000_000_000).mul(UNIT); // 1b

function toBN(val: string | number) {
  return BigNumber.from(val.toString());
}

task('runAllInteractions', 'Run all interactions').setAction(async (args, { ethers, run, network }) => {
  await run('sendAssetsToTest');
});

task('deployAll', 'Deploy all contracts')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    const nftToken = await run('deployInfinityToken', {
      verify: args.verify,
      inflation: INFLATION.toString(),
      epochduration: EPOCH_DURATION.toString(),
      cliff: CLIFF_PERIOD.toString(),
      maxepochs: MAX_EPOCHS.toString(),
      timelock: TIMELOCK.toString(),
      supply: INITIAL_SUPPLY.toString()
    });
    nftTokenAddress = nftToken.address;

    const mock721a = await run('deployMock721', { verify: args.verify, name: 'Mock721A', symbol: 'MCKA' });
    mock721Address1 = mock721a.address;
    const mock721b = await run('deployMock721', { verify: args.verify, name: 'Mock721B', symbol: 'MCKB' });
    mock721Address2 = mock721b.address;
    const mock721c = await run('deployMock721', { verify: args.verify, name: 'Mock721C', symbol: 'MCKC' });
    mock721Address3 = mock721c.address;

    const currencyRegistry = await run('deployCurrencyRegistry', { verify: args.verify });

    const complicationRegistry = await run('deployComplicationRegistry', { verify: args.verify });

    const infinityExchange = await run('deployExchange', {
      verify: args.verify,
      currencyregistry: currencyRegistry.address,
      complicationregistry: complicationRegistry.address,
      wethaddress: WETH_ADDRESS ?? nftTokenAddress
    });

    const obComplication = await run('deployOBComplication', {
      verify: args.verify,
      protocolfee: '0',
      errorbound: '1000000000'
    });

    // run all interactions
    await run('runAllInteractions');
  });

task('deployMock20', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const mock20 = await deployContract('MockERC20', await ethers.getContractFactory('MockERC20'), signer);

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await mock20.deployTransaction.wait(5);
      await run('verify:verify', {
        address: mock20.address,
        contract: 'contracts/MockERC20.sol:MockERC20'
      });
    }
    return mock20;
  });

task('deployInfinityToken', 'Deploy Infinity token contract')
  .addParam('supply', 'initial supply')
  .addParam('inflation', 'per epoch inflation')
  .addParam('epochduration', 'epoch duration in days')
  .addParam('cliff', 'initial cliff in days')
  .addParam('maxepochs', 'max number of epochs')
  .addParam('timelock', 'timelock duration in days')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];

    const tokenArgs = [
      signer.address,
      parseEther(args.inflation),
      BigNumber.from(args.epochduration).mul(DAY),
      BigNumber.from(args.cliff).mul(DAY),
      args.maxepochs,
      BigNumber.from(args.timelock).mul(DAY),
      parseEther(args.supply)
    ];

    const infinityToken = await deployContract(
      'InfinityToken',
      await ethers.getContractFactory('InfinityToken'),
      signer,
      tokenArgs
    );

    // post deployment checks

    console.log('Validating deployment');

    expect(await infinityToken.balanceOf(signer.address)).to.be.eq(parseEther(args.supply));
    expect(await infinityToken.getAdmin()).to.be.eq(signer.address);
    expect(await infinityToken.getTimelock()).to.be.eq(BigNumber.from(args.timelock).mul(DAY));
    expect(await infinityToken.getInflation()).to.be.eq(parseEther(args.inflation));
    expect(await infinityToken.getEpochDuration()).to.be.eq(BigNumber.from(args.epochduration).mul(DAY));

    // verify etherscan
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await infinityToken.deployTransaction.wait(5);
      await run('verify:verify', {
        address: infinityToken.address,
        contract: 'contracts/token/InfinityToken.sol:InfinityToken',
        constructorArguments: tokenArgs
      });
    }

    return infinityToken;
  });

task('deployMock721', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('name', 'name')
  .addParam('symbol', 'symbol')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const mock721 = await deployContract('MockERC721', await ethers.getContractFactory('MockERC721'), signer, [
      args.name,
      args.symbol
    ]);

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await mock721.deployTransaction.wait(5);
      await run('verify:verify', {
        address: mock721.address,
        contract: 'contracts/MockERC721.sol:MockERC721',
        constructorArguments: [args.name, args.symbol]
      });
    }
    return mock721;
  });

task('deployCurrencyRegistry', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const currencyRegistry = await deployContract(
      'InfinityCurrencyRegistry',
      await ethers.getContractFactory('InfinityCurrencyRegistry'),
      signer
    );

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await currencyRegistry.deployTransaction.wait(5);
      await run('verify:verify', {
        address: currencyRegistry.address,
        contract: 'contracts/core/InfinityCurrencyRegistry.sol:InfinityCurrencyRegistry'
      });
    }
    return currencyRegistry;
  });

task('deployComplicationRegistry', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const complicationRegistry = await deployContract(
      'InfinityComplicationRegistry',
      await ethers.getContractFactory('InfinityComplicationRegistry'),
      signer
    );

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await complicationRegistry.deployTransaction.wait(5);
      await run('verify:verify', {
        address: complicationRegistry.address,
        contract: 'contracts/core/InfinityComplicationRegistry.sol:InfinityComplicationRegistry'
      });
    }
    return complicationRegistry;
  });

task('deployExchange', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('currencyregistry', 'currency registry address')
  .addParam('complicationregistry', 'complication registry address')
  .addParam('wethaddress', 'weth address')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const infinityExchange = await deployContract(
      'InfinityExchange',
      await ethers.getContractFactory('InfinityExchange'),
      signer,
      [args.currencyregistry, args.complicationregistry, args.wethaddress]
    );

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await infinityExchange.deployTransaction.wait(5);
      await run('verify:verify', {
        address: infinityExchange.address,
        contract: 'contracts/core/InfinityExchange.sol:InfinityExchange',
        constructorArguments: [args.currencyregistry, args.complicationregistry, args.wethaddress]
      });
    }
    return infinityExchange;
  });

task('deployOBComplication', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('protocolfee', 'protocol fee')
  .addParam('errorbound', 'error bound')
  .setAction(async (args, { ethers, run, network }) => {
    // get signer
    const signer = (await ethers.getSigners())[0];
    const obComplication = await deployContract(
      'InfinityOrderBookComplication',
      await ethers.getContractFactory('InfinityOrderBookComplication'),
      signer,
      [args.protocolfee, args.errorbound]
    );

    // verify source
    if (args.verify) {
      console.log('Verifying source on etherscan');
      await obComplication.deployTransaction.wait(5);
      await run('verify:verify', {
        address: obComplication.address,
        contract: 'contracts/core/InfinityOrderBookComplication.sol:InfinityOrderBookComplication',
        constructorArguments: [args.protocolfee, args.errorbound]
      });
    }
    return obComplication;
  });

// ============================================== interactions and tests ==============================================

task('sendAssetsToTest', 'Sends mock721s and mock20 tokens to 2 test addresses').setAction(
  async (args, { ethers, run, network }) => {
    const signer = (await ethers.getSigners())[0];
    const addr1 = signer.address;
    const addr2 = (await ethers.getSigners())[1].address;
    if (mock20Address) {
      const mock20 = new ethers.Contract(mock20Address, erc20Abi, signer);
      await mock20.transfer(addr2, ethers.utils.parseUnits('10000', 18));
    }
    if (mock721Address1 && mock721Address2 && mock721Address3) {
      const mock721a = new ethers.Contract(mock721Address1, erc721Abi, signer);
      const mock721b = new ethers.Contract(mock721Address2, erc721Abi, signer);
      const mock721c = new ethers.Contract(mock721Address3, erc721Abi, signer);
      for (let i = 0; i < 10; i++) {
        await mock721a.transferFrom(addr1, addr2, i);
        await mock721b.transferFrom(addr1, addr2, i);
        await mock721c.transferFrom(addr1, addr2, i);
      }
    }
  }
);
