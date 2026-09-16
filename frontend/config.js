// Shared Trestle chain configuration. Keep this as the single source for UI pages.
(() => {
  const CONFIG = {
    bot:  { key:'bot',  name:'BOT Chain', network:'BOT testnet', domain:968, chainId:'0x3c8',
            rpc:'https://rpc.bohr.life', explorer:'https://scan.bohr.life/tx/', icon:'B', kind:'bot',
            token:'0x75edC9335175Fc0552D51D48439F229c10420fe3', router:'0xb2BFd514997773eBe9AF77E83e153e3A5405CEB6',
            tokenLabel:'USDT', native:{symbol:'tBOT', decimals:18} },
    arb:  { key:'arb',  name:'Arbitrum', network:'Sepolia', domain:421614, chainId:'0x66eee',
            rpc:'https://sepolia-rollup.arbitrum.io/rpc', explorer:'https://sepolia.arbiscan.io/tx/', icon:'A', kind:'arb',
            token:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6', router:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6',
            tokenLabel:'botUSDT', native:{symbol:'ETH', decimals:18} },
    base: { key:'base', name:'Base', network:'Sepolia', domain:84532, chainId:'0x14a34',
            rpc:'https://sepolia.base.org', explorer:'https://sepolia.basescan.org/tx/', icon:'B', kind:'base',
            token:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6', router:'0x291a962DE3f64fA46f7151c6B7492C04CFDCE5f6',
            tokenLabel:'botUSDT', native:{symbol:'ETH', decimals:18} },
    arc:  { key:'arc',  name:'Arc', network:'Testnet', domain:5042002, chainId:'0x4cef52',
            rpc:'https://rpc.testnet.arc.network', explorer:'https://testnet.arcscan.app/tx/', icon:'C', kind:'arc',
            token:'0x73E7fa23EE5743959A24143B6f51D2B5D9ffC784', router:'0x73E7fa23EE5743959A24143B6f51D2B5D9ffC784',
            tokenLabel:'botUSDT', native:{symbol:'USDC', decimals:18} },
  };
  const CHAIN_ORDER = ['bot','arb','base','arc'];
  window.__trestleConfig = { CONFIG, CHAIN_ORDER };
})();
