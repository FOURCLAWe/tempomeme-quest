const form = document.querySelector("#analyze-form");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const resultEl = document.querySelector("#result");
const copyRowTemplate = document.querySelector("#copy-row-template");
const submitButton = form.querySelector("button[type='submit']");
const formStatus = document.querySelector("#form-status");
const txLabel = document.querySelector("#tx-label");
const amountLabel = document.querySelector("#amount-label");
const tradeAmountInput = document.querySelector("#trade-amount");
const modeNote = document.querySelector("#mode-note");
const emptyCopy = document.querySelector("#empty-copy");

const txRegex = /0x[a-fA-F0-9]{64}/;
const addressRegex = /0x[a-fA-F0-9]{40}/;
const defaultEthRpcUrl = "https://ethereum-rpc.publicnode.com";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const slippageDenominator = 10000n;
const knownMethods = {
  "0x077587dd": "V4 hook/router custom ETH buy",
  "0x286d4c33": "V4 hook/router custom token sell",
  "0x7ff36ab5": "Uniswap V2 swapExactETHForTokens",
  "0xb6f9de95": "Uniswap V2 swapExactETHForTokensSupportingFeeOnTransferTokens",
  "0x18cbafe5": "Uniswap V2 swapExactTokensForETH",
  "0x791ac947": "Uniswap V2 swapExactTokensForETHSupportingFeeOnTransferTokens",
  "0x38ed1739": "Uniswap V2 swapExactTokensForTokens",
  "0x5c11d795": "Uniswap V2 swapExactTokensForTokensSupportingFeeOnTransferTokens",
  "0xd96a094a": "Bonding-curve buy(uint256 minAmountOut)",
  "0xd79875eb": "Bonding-curve sell(uint256 amountIn,uint256 minEthOut)",
  "0x24856bc3": "Uniswap Universal Router execute(bytes,bytes[])",
  "0x3593564c": "Uniswap Universal Router execute(bytes,bytes[],uint256)",
  "0x414bf389": "Uniswap V3 exactInputSingle",
  "0x04e45aaf": "Uniswap V3 exactInputSingle",
  "0xc04b8d59": "Uniswap V3 exactInput",
  "0xb858183f": "Uniswap V3 exactInput",
  "0xeffbec13": "V4 hook/router swap(tuple[],address,uint256,uint256,uint256)",
  "0xb2703a63": "V4 hook/router token sell",
  "0x08c1284c": "Aggregator packed sell"
};

function extractTxHash(value) {
  const match = String(value || "").match(txRegex);
  return match ? match[0] : "";
}

function extractAddress(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(addressRegex);
  return match ? match[0] : "";
}

function setFormStatus(message, state = "") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${state}`.trim();
}

function setView(view) {
  emptyState.hidden = view !== "empty";
  loadingState.hidden = view !== "loading";
  resultEl.hidden = view !== "result";
}

function getTradeType() {
  return form.querySelector("input[name='tradeType']:checked")?.value === "sell" ? "sell" : "buy";
}

function updateModeCopy() {
  const tradeType = getTradeType();
  const isSell = tradeType === "sell";
  txLabel.textContent = isSell ? "成功卖出 tx" : "成功买入 tx";
  amountLabel.textContent = isSell ? "卖出代币数量" : "买入 ETH 数量";
  tradeAmountInput.placeholder = isSell ? "74" : "0.05";
  modeNote.textContent = isSell
    ? "按滑点重算最小输出；勾强制成交会把 minOut 设为 0。"
    : "按滑点重算最小输出；价格涨太快就调大滑点。";
  emptyCopy.textContent = isSell
    ? "输入一笔已经成功卖出的 Ethereum 交易，工具会解析卖出路径。"
    : "输入一笔已经成功买入的 Ethereum 交易，工具会解析购买路径。";
  setFormStatus(isSell ? "准备好了，粘完整卖出 tx 后点按钮。" : "准备好了，粘完整买入 tx 后点按钮。");
  setView("empty");
  resultEl.innerHTML = "";
}

function showLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "解析中..." : "解析并生成";
  setView(isLoading ? "loading" : "result");
  if (isLoading) setFormStatus("正在读取链上交易，慢的话 15 秒会自动超时。");
}

function strip0x(value) {
  return String(value || "").replace(/^0x/i, "");
}

function normalizeAddress(value) {
  return `0x${strip0x(value).toLowerCase()}`;
}

function normalizeHex(value) {
  const clean = strip0x(value);
  return `0x${clean.length % 2 ? `0${clean}` : clean}`.toLowerCase();
}

function hexToBigInt(value) {
  const clean = strip0x(value);
  return clean ? BigInt(`0x${clean}`) : 0n;
}

function bigIntToWord(value) {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  if (bigint < 0n) throw new Error("Cannot ABI-encode a negative integer");
  return bigint.toString(16).padStart(64, "0");
}

function addressToWord(address) {
  if (!addressRegex.test(address)) throw new Error("Invalid EVM address");
  return strip0x(address).toLowerCase().padStart(64, "0");
}

function parseDecimalToUnits(value, decimals = 18) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Amount must be a decimal number");
  const [whole, fraction = ""] = trimmed.split(".");
  const safeDecimals = Math.max(0, Number(decimals) || 0);
  const paddedFraction = fraction.padEnd(safeDecimals, "0").slice(0, safeDecimals);
  return BigInt(whole || "0") * 10n ** BigInt(safeDecimals) + BigInt(paddedFraction || "0");
}

function parseSlippageBps(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return 3000n;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) throw new Error("Slippage must be a percent from 0 to 100");
  const [whole, fraction = ""] = trimmed.split(".");
  const bps = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  if (bps < 0n || bps > slippageDenominator) throw new Error("Slippage must be between 0 and 100");
  return bps;
}

function formatSlippageBps(bps) {
  const value = typeof bps === "bigint" ? bps : BigInt(bps || 0);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

function applySlippage(amount, slippageBps) {
  return (BigInt(amount || 0) * (slippageDenominator - slippageBps)) / slippageDenominator;
}

function scaleAmount(amount, newInput, originalInput) {
  const oldInput = BigInt(originalInput || 0);
  if (oldInput === 0n) return null;
  return (BigInt(amount || 0) * BigInt(newInput || 0)) / oldInput;
}

function computeMinOut({ actualOutput, originalMinOut, originalInput, newInput, slippageBps, forceZero }) {
  if (forceZero) {
    return {
      value: 0n,
      mode: "zero",
      message: "最小输出已设为 0，成交更容易，但滑点/夹子风险更高"
    };
  }

  const basis = actualOutput ?? originalMinOut;
  const scaled = basis != null ? scaleAmount(basis, newInput, originalInput) : null;
  if (scaled != null) {
    return {
      value: applySlippage(scaled, slippageBps),
      mode: "slippage",
      message: `已按原成交比例并扣 ${formatSlippageBps(slippageBps)} 滑点重算最小输出`
    };
  }

  return {
    value: originalMinOut ?? 0n,
    mode: "preserve",
    message: "没有足够数据重算最小输出，已保留原交易的最小输出字段"
  };
}

function formatUnits(amount, decimals = 18, maxFraction = 8) {
  const value = BigInt(amount || 0);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText.slice(0, maxFraction)}`;
}

function splitWordsFromCalldata(input) {
  const body = strip0x(input).slice(8);
  const words = [];
  for (let i = 0; i < body.length; i += 64) {
    words.push(body.slice(i, i + 64).padEnd(64, "0"));
  }
  return words;
}

function wordToAddress(word) {
  const clean = strip0x(word).padStart(64, "0");
  return `0x${clean.slice(24).toLowerCase()}`;
}

function encodeStaticWords(selector, words) {
  return normalizeHex(`${strip0x(selector).slice(0, 8)}${words.join("")}`);
}

function replaceWordOccurrences(hexData, oldWord, newWord) {
  const clean = strip0x(hexData);
  const selector = clean.length >= 8 ? clean.slice(0, 8) : "";
  const body = clean.slice(selector.length);
  let count = 0;
  let output = "";
  for (let i = 0; i < body.length; i += 64) {
    const word = body.slice(i, i + 64);
    if (word.toLowerCase() === oldWord.toLowerCase()) {
      output += newWord.toLowerCase();
      count += 1;
    } else {
      output += word;
    }
  }
  return { data: `0x${selector}${output}`, count };
}

function replacePaddedAddressEverywhere(hexData, fromAddress, toAddress) {
  return replaceWordOccurrences(hexData, addressToWord(fromAddress), addressToWord(toAddress));
}

function parseTransferLog(log) {
  if (!Array.isArray(log.topics) || log.topics.length < 3) return null;
  if (String(log.topics[0]).toLowerCase() !== transferTopic) return null;
  return {
    token: normalizeAddress(log.address),
    from: wordToAddress(log.topics[1]),
    to: wordToAddress(log.topics[2]),
    amount: hexToBigInt(log.data || "0x0"),
    logIndex: Number(hexToBigInt(log.logIndex || "0x0"))
  };
}

async function ethRpc(method, params = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(defaultEthRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || "RPC request failed");
    return payload.result;
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error("RPC 请求超时，请稍后重试");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function ethCall(to, data) {
  return ethRpc("eth_call", [{ to, data }, "latest"]);
}

function hexToUtf8(hexValue) {
  const clean = strip0x(hexValue);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

function decodeAbiStringResult(hexValue) {
  const clean = strip0x(hexValue);
  if (!clean || clean === "0".repeat(clean.length)) return "";
  try {
    if (clean.length >= 128) {
      const offset = Number(hexToBigInt(clean.slice(0, 64)));
      const lengthStart = offset * 2;
      const byteLength = Number(hexToBigInt(clean.slice(lengthStart, lengthStart + 64)));
      return hexToUtf8(clean.slice(lengthStart + 64, lengthStart + 64 + byteLength * 2));
    }
    return hexToUtf8(clean.slice(0, 64));
  } catch {
    return "";
  }
}

async function getTokenMeta(tokenAddress, cache) {
  const address = normalizeAddress(tokenAddress);
  if (cache.has(address)) return cache.get(address);
  const fallback = { address, name: "", symbol: "", decimals: 18 };
  cache.set(address, fallback);
  try {
    const [nameRaw, symbolRaw, decimalsRaw] = await Promise.allSettled([
      ethCall(address, "0x06fdde03"),
      ethCall(address, "0x95d89b41"),
      ethCall(address, "0x313ce567")
    ]);
    const meta = {
      address,
      name: nameRaw.status === "fulfilled" ? decodeAbiStringResult(nameRaw.value) : "",
      symbol: symbolRaw.status === "fulfilled" ? decodeAbiStringResult(symbolRaw.value) : "",
      decimals:
        decimalsRaw.status === "fulfilled" && decimalsRaw.value
          ? Number(hexToBigInt(decimalsRaw.value))
          : 18
    };
    cache.set(address, meta);
    return meta;
  } catch {
    return fallback;
  }
}

function decodeV2EthSwap(input) {
  const selector = normalizeHex(input).slice(0, 10);
  const words = splitWordsFromCalldata(input);
  if (words.length < 5) return null;
  const pathOffset = Number(hexToBigInt(words[1])) / 32;
  if (!Number.isInteger(pathOffset) || pathOffset < 4 || pathOffset >= words.length) return null;
  const pathLength = Number(hexToBigInt(words[pathOffset]));
  const path = [];
  for (let i = 0; i < pathLength; i += 1) path.push(wordToAddress(words[pathOffset + 1 + i]));
  return {
    selector,
    amountOutMin: hexToBigInt(words[0]),
    recipient: wordToAddress(words[2]),
    deadline: hexToBigInt(words[3]),
    path
  };
}

function encodeV2EthSwap(selector, decoded) {
  return encodeStaticWords(selector, [
    bigIntToWord(decoded.amountOutMin),
    bigIntToWord(128n),
    addressToWord(decoded.recipient),
    bigIntToWord(decoded.deadline),
    bigIntToWord(BigInt(decoded.path.length)),
    ...decoded.path.map(addressToWord)
  ]);
}

function decodeV2TokenSwap(input) {
  const selector = normalizeHex(input).slice(0, 10);
  const words = splitWordsFromCalldata(input);
  if (words.length < 6) return null;
  const pathOffset = Number(hexToBigInt(words[2])) / 32;
  if (!Number.isInteger(pathOffset) || pathOffset < 5 || pathOffset >= words.length) return null;
  const pathLength = Number(hexToBigInt(words[pathOffset]));
  const path = [];
  for (let i = 0; i < pathLength; i += 1) path.push(wordToAddress(words[pathOffset + 1 + i]));
  return {
    selector,
    amountIn: hexToBigInt(words[0]),
    amountOutMin: hexToBigInt(words[1]),
    recipient: wordToAddress(words[3]),
    deadline: hexToBigInt(words[4]),
    path
  };
}

function encodeV2TokenSwap(selector, decoded) {
  return encodeStaticWords(selector, [
    bigIntToWord(decoded.amountIn),
    bigIntToWord(decoded.amountOutMin),
    bigIntToWord(160n),
    addressToWord(decoded.recipient),
    bigIntToWord(decoded.deadline),
    bigIntToWord(BigInt(decoded.path.length)),
    ...decoded.path.map(addressToWord)
  ]);
}

function buildApproveTransaction(token, spender, amountRaw, tokenMeta = {}) {
  if (!token || !spender || amountRaw == null) return null;
  const amount = BigInt(amountRaw);
  return {
    to: normalizeAddress(token),
    valueWei: "0",
    valueEth: "0",
    data: encodeStaticWords("0x095ea7b3", [addressToWord(spender), bigIntToWord(amount)]),
    spender: normalizeAddress(spender),
    amountRaw: amount.toString(),
    amount: formatUnits(amount, tokenMeta.decimals ?? 18, 8),
    symbol: tokenMeta.symbol || "TOKEN"
  };
}

function buildGeneratedBuyTransaction(tx, options) {
  const buyerAddress = options.walletAddress ? normalizeAddress(options.walletAddress) : "";
  const newValueWei = options.valueWei ?? hexToBigInt(tx.value || "0x0");
  const originalValueWei = hexToBigInt(tx.value || "0x0");
  const selector = normalizeHex(tx.input || "0x").slice(0, 10);
  const forceMinOutZero = Boolean(options.forceMinOutZero);
  const slippageBps = options.slippageBps ?? 3000n;
  const actualOutput =
    options.primaryReceivedToken?.amountRaw != null ? BigInt(options.primaryReceivedToken.amountRaw) : null;
  const changes = [];
  const warnings = [];
  let confidence = "medium";
  let data = normalizeHex(tx.input || "0x");

  if (!buyerAddress) return null;

  if (selector === "0x7ff36ab5" || selector === "0xb6f9de95") {
    const decoded = decodeV2EthSwap(data);
    if (decoded) {
      decoded.recipient = buyerAddress;
      decoded.deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const minOut = computeMinOut({
        actualOutput,
        originalMinOut: decoded.amountOutMin,
        originalInput: originalValueWei,
        newInput: newValueWei,
        slippageBps,
        forceZero: forceMinOutZero
      });
      decoded.amountOutMin = minOut.value;
      data = encodeV2EthSwap(selector, decoded);
      confidence = "high";
      changes.push("已把 V2 swap 接收地址改成你的钱包");
      changes.push("已把 deadline 刷新为 1 小时内有效");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0x077587dd") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 8) {
      words[5] = addressToWord(buyerAddress);
      words[6] = addressToWord(buyerAddress);
      const minOut = computeMinOut({
        actualOutput,
        originalMinOut: hexToBigInt(words[7]),
        originalInput: originalValueWei,
        newInput: newValueWei,
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[7] = bigIntToWord(minOut.value);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      changes.push("已把自定义买入路由里的 recipient/payer 改成你的钱包");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0xd96a094a") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 1) {
      const minOut = computeMinOut({
        actualOutput,
        originalMinOut: hexToBigInt(words[0]),
        originalInput: originalValueWei,
        newInput: newValueWei,
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[0] = bigIntToWord(minOut.value);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0xeffbec13") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 5) {
      words[2] = bigIntToWord(newValueWei);
      const minOut = computeMinOut({
        actualOutput,
        originalMinOut: hexToBigInt(words[3]),
        originalInput: originalValueWei,
        newInput: newValueWei,
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[3] = bigIntToWord(minOut.value);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      changes.push("已把 swap 的 amountIn 改成新的 ETH 数量");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else {
    const addressReplace = replacePaddedAddressEverywhere(data, tx.from, buyerAddress);
    data = addressReplace.data;
    if (addressReplace.count > 0) changes.push(`已替换 ${addressReplace.count} 处原买家地址`);
    else warnings.push("calldata 里没有发现原买家地址，可能使用 msg.sender 或特殊 recipient");

    if (originalValueWei > 0n && newValueWei !== originalValueWei) {
      const valueReplace = replaceWordOccurrences(data, bigIntToWord(originalValueWei), bigIntToWord(newValueWei));
      data = valueReplace.data;
      if (valueReplace.count > 0) changes.push(`已替换 ${valueReplace.count} 处原 ETH 数量字段`);
      else warnings.push("calldata 里没有发现原 ETH 数量字段，只修改外层 Value");
    }

    confidence = selector === "0x24856bc3" || selector === "0x3593564c" ? "medium" : "low";
    warnings.push(
      confidence === "medium"
        ? "Universal Router/V4 的内部路径较复杂，本工具会替换地址和金额，但不会盲目改所有最小输出"
        : "未知方法，只做通用地址/金额替换；发交易前建议先小额测试"
    );
  }

  return {
    to: normalizeAddress(tx.to || "0x0000000000000000000000000000000000000000"),
    valueWei: newValueWei.toString(),
    valueEth: formatUnits(newValueWei, 18, 18),
    data,
    confidence,
    changes,
    warnings,
    slippagePercent: formatSlippageBps(slippageBps),
    forceMinOutZero
  };
}

function buildGeneratedSellTransaction(tx, options, context = {}) {
  const walletAddress = options.walletAddress ? normalizeAddress(options.walletAddress) : "";
  const selector = normalizeHex(tx.input || "0x").slice(0, 10);
  const forceMinOutZero = Boolean(options.forceMinOutZero);
  const slippageBps = options.slippageBps ?? 3000n;
  const originalSellAmount =
    context.primarySentToken?.amountRaw != null ? BigInt(context.primarySentToken.amountRaw) : null;
  const sellAmountRaw = options.sellAmountRaw ?? originalSellAmount;
  const changes = [];
  const warnings = [];
  let confidence = "medium";
  let data = normalizeHex(tx.input || "0x");

  if (!walletAddress) return null;
  if (sellAmountRaw == null) warnings.push("没从日志里识别出卖出的 ERC20 数量；只能做地址替换");

  if (
    selector === "0x18cbafe5" ||
    selector === "0x791ac947" ||
    selector === "0x38ed1739" ||
    selector === "0x5c11d795"
  ) {
    const decoded = decodeV2TokenSwap(data);
    if (decoded) {
      const originalDecodedAmountIn = decoded.amountIn;
      if (sellAmountRaw != null) decoded.amountIn = sellAmountRaw;
      decoded.recipient = walletAddress;
      decoded.deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const minOut = computeMinOut({
        actualOutput: null,
        originalMinOut: decoded.amountOutMin,
        originalInput: originalSellAmount ?? originalDecodedAmountIn,
        newInput: sellAmountRaw ?? decoded.amountIn,
        slippageBps,
        forceZero: forceMinOutZero
      });
      decoded.amountOutMin = minOut.value;
      data = encodeV2TokenSwap(selector, decoded);
      confidence = "high";
      changes.push("已把 V2 卖出数量改成你的输入");
      changes.push("已把 ETH/代币接收地址改成你的钱包");
      changes.push("已把 deadline 刷新为 1 小时内有效");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0x286d4c33") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 9) {
      const minOut = computeMinOut({
        actualOutput: null,
        originalMinOut: hexToBigInt(words[0]),
        originalInput: originalSellAmount,
        newInput: sellAmountRaw ?? originalSellAmount,
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[0] = bigIntToWord(minOut.value);
      words[5] = addressToWord(walletAddress);
      words[6] = addressToWord(walletAddress);
      if (sellAmountRaw != null) words[7] = bigIntToWord(sellAmountRaw);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      changes.push("已把自定义卖出路由里的 sender/recipient 改成你的钱包");
      if (sellAmountRaw != null) changes.push("已把卖出数量改成你的输入");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0xd79875eb") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 2) {
      if (sellAmountRaw != null) words[0] = bigIntToWord(sellAmountRaw);
      const minOut = computeMinOut({
        actualOutput: null,
        originalMinOut: hexToBigInt(words[1]),
        originalInput: originalSellAmount ?? hexToBigInt(words[0]),
        newInput: sellAmountRaw ?? originalSellAmount ?? hexToBigInt(words[0]),
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[1] = bigIntToWord(minOut.value);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      if (sellAmountRaw != null) changes.push("已把 sell(amountIn,minEthOut) 的卖出数量改成你的输入");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else if (selector === "0xb2703a63") {
    const words = splitWordsFromCalldata(data);
    if (words.length >= 4) {
      if (sellAmountRaw != null) words[0] = bigIntToWord(sellAmountRaw);
      const minOut = computeMinOut({
        actualOutput: null,
        originalMinOut: hexToBigInt(words[1]),
        originalInput: originalSellAmount,
        newInput: sellAmountRaw ?? originalSellAmount,
        slippageBps,
        forceZero: forceMinOutZero
      });
      words[1] = bigIntToWord(minOut.value);
      words[3] = addressToWord(walletAddress);
      data = encodeStaticWords(selector, words);
      confidence = "high";
      changes.push("已把 V4/hook 卖出路由里的卖家地址改成你的钱包");
      if (sellAmountRaw != null) changes.push("已把卖出数量改成你的输入");
      changes.push(minOut.message);
      if (minOut.mode === "zero") warnings.push(minOut.message);
    }
  } else {
    const addressReplace = replacePaddedAddressEverywhere(data, tx.from, walletAddress);
    data = addressReplace.data;
    if (addressReplace.count > 0) changes.push(`已替换 ${addressReplace.count} 处原卖家地址`);
    else warnings.push("calldata 里没有发现原卖家地址，可能使用 msg.sender、Permit2 或打包路径");

    if (originalSellAmount != null && sellAmountRaw != null && sellAmountRaw !== originalSellAmount) {
      const amountReplace = replaceWordOccurrences(
        data,
        bigIntToWord(originalSellAmount),
        bigIntToWord(sellAmountRaw)
      );
      data = amountReplace.data;
      if (amountReplace.count > 0) changes.push(`已替换 ${amountReplace.count} 处原卖出数量字段`);
      else warnings.push("calldata 里没有发现标准 32-byte 卖出数量字段，可能是 packed route");
    }

    confidence = "low";
    warnings.push(
      selector === "0x24856bc3" || selector === "0x3593564c" || selector === "0x08c1284c"
        ? "这是打包路由/Universal Router，路径较复杂；工具只做安全可见字段替换，务必先小额测试"
        : "未知卖出方法，只做通用地址/数量替换；发交易前建议先小额测试"
    );
  }

  const router = normalizeAddress(tx.to || "0x0000000000000000000000000000000000000000");
  const tokenMeta = context.primarySentToken || {};
  const approve =
    context.primarySentToken && sellAmountRaw != null
      ? buildApproveTransaction(context.primarySentToken.token, router, sellAmountRaw, tokenMeta)
      : null;

  if (approve) changes.push(`已生成 ${approve.symbol} 授权交易，spender 是卖出路由`);
  else warnings.push("没有生成授权交易，因为没识别出卖出的 ERC20 token");

  return {
    to: router,
    valueWei: "0",
    valueEth: "0",
    data,
    confidence,
    changes,
    warnings,
    approve,
    slippagePercent: formatSlippageBps(slippageBps),
    forceMinOutZero
  };
}

async function analyzeTransaction(payload) {
  const tradeType = payload.tradeType === "sell" ? "sell" : "buy";
  const slippageBps = parseSlippageBps(payload.slippagePercent);
  const forceMinOutZero = payload.forceMinOutZero === true;
  const [tx, receipt] = await Promise.all([
    ethRpc("eth_getTransactionByHash", [payload.txHash]),
    ethRpc("eth_getTransactionReceipt", [payload.txHash])
  ]);
  if (!tx) throw new Error("RPC 没查到这笔交易");

  const selector = tx.input && tx.input !== "0x" ? normalizeHex(tx.input).slice(0, 10) : "0x";
  const transfers = receipt?.logs?.map(parseTransferLog).filter(Boolean) || [];
  const metaCache = new Map();
  await Promise.all([...new Set(transfers.map((transfer) => transfer.token))].map((token) => getTokenMeta(token, metaCache)));

  const enrichedTransfers = transfers.map((transfer) => {
    const meta = metaCache.get(transfer.token) || { symbol: "TOKEN", name: "", decimals: 18 };
    return {
      token: transfer.token,
      symbol: meta.symbol || "TOKEN",
      name: meta.name || "",
      decimals: meta.decimals,
      from: transfer.from,
      to: transfer.to,
      amountRaw: transfer.amount.toString(),
      amount: formatUnits(transfer.amount, meta.decimals, 8),
      logIndex: transfer.logIndex
    };
  });

  const fromAddress = normalizeAddress(tx.from);
  const receivedTokens = enrichedTransfers.filter(
    (transfer) => transfer.to === fromAddress && transfer.token !== wethAddress
  );
  const sentTokens = enrichedTransfers.filter(
    (transfer) => transfer.from === fromAddress && transfer.token !== wethAddress
  );
  const primarySentToken = sentTokens[0] || null;

  let sellAmountRaw = null;
  if (tradeType === "sell") {
    sellAmountRaw = parseDecimalToUnits(payload.tradeAmount, primarySentToken?.decimals ?? 18);
  }

  const valueWei =
    tradeType === "buy" ? parseDecimalToUnits(payload.tradeAmount, 18) ?? hexToBigInt(tx.value || "0x0") : null;

  const generated =
    tradeType === "sell"
      ? buildGeneratedSellTransaction(
          tx,
          { walletAddress: payload.walletAddress, sellAmountRaw, forceMinOutZero, slippageBps },
          { primarySentToken }
        )
      : buildGeneratedBuyTransaction(tx, {
          walletAddress: payload.walletAddress,
          valueWei,
          forceMinOutZero,
          slippageBps,
          primaryReceivedToken: receivedTokens[0] || null
        });

  return {
    tx: {
      hash: normalizeHex(tx.hash),
      status: receipt?.status === "0x1" ? "success" : receipt?.status === "0x0" ? "failed" : "unknown",
      from: fromAddress,
      to: tx.to ? normalizeAddress(tx.to) : "",
      valueWei: hexToBigInt(tx.value || "0x0").toString(),
      valueEth: formatUnits(hexToBigInt(tx.value || "0x0"), 18, 18),
      selector,
      method: knownMethods[selector] || "Unknown method",
      blockNumber: tx.blockNumber ? Number(hexToBigInt(tx.blockNumber)) : null,
      etherscanUrl: `https://etherscan.io/tx/${normalizeHex(tx.hash)}`
    },
    tradeType,
    receivedTokens,
    sentTokens,
    transfers: enrichedTransfers.slice(0, 60),
    generated,
    slippage: {
      percent: formatSlippageBps(slippageBps),
      forceMinOutZero
    },
    notes: [
      "工具只生成交易参数，不会发送交易。",
      "新币池子很薄时，最小输出设为 0 虽然更容易成交，但更容易被滑点或夹子吃掉。",
      "卖出前通常要先发 approve 授权；如果你已经授权过足够额度，可以跳过 approve。"
    ]
  };
}

function shortAddress(value) {
  if (!value || value.length < 12) return value || "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function createMetric(label, value, extraClass = "") {
  const item = document.createElement("div");
  item.className = "metric";
  const labelEl = document.createElement("span");
  labelEl.className = "metric-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.className = `metric-value ${extraClass}`.trim();
  valueEl.textContent = value;
  item.append(labelEl, valueEl);
  return item;
}

function createCopyRow(label, value, tall = false) {
  const node = copyRowTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".copy-label").textContent = label;
  const textarea = node.querySelector("textarea");
  textarea.value = value || "";
  if (tall) textarea.style.minHeight = "160px";
  const button = node.querySelector(".copy-btn");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = "复制";
      }, 900);
    } catch {
      textarea.select();
      document.execCommand("copy");
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = "复制";
      }, 900);
    }
  });
  return node;
}

function createCopyGroup(title, rows) {
  const group = document.createElement("div");
  group.className = "copy-group";
  const heading = document.createElement("p");
  heading.className = "copy-group-title";
  heading.textContent = title;
  group.append(heading);
  for (const row of rows) {
    group.append(createCopyRow(row.label, row.value, row.tall));
  }
  return group;
}

function createList(items, className) {
  const list = document.createElement("ul");
  list.className = className;
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  }
  return list;
}

function createSection(title, content) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading, content);
  return section;
}

function renderTokens(tokens, emptyText = "没有识别到直接转入原买家钱包的 ERC20。") {
  const list = document.createElement("ul");
  list.className = "token-list";
  if (!tokens.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    list.append(li);
    return list;
  }
  for (const token of tokens) {
    const li = document.createElement("li");
    li.textContent = `${token.amount} ${token.symbol} (${shortAddress(token.token)})`;
    list.append(li);
  }
  return list;
}

function renderResult(data) {
  resultEl.innerHTML = "";
  setFormStatus("解析完成，可以复制右侧参数。", "ok");
  const isSell = data.tradeType === "sell";

  const summary = document.createElement("div");
  summary.className = "summary-grid";
  const status = document.createElement("span");
  status.className = `status ${data.tx.status === "failed" ? "failed" : ""}`.trim();
  status.textContent = data.tx.status;

  summary.append(
    createMetric("原交易", data.tx.hash),
    createMetric("方法", `${data.tx.selector} / ${data.tx.method}`),
    createMetric(isSell ? "原卖家" : "原买家", data.tx.from),
    createMetric("路由 To", data.tx.to),
    createMetric("原 Value", `${data.tx.valueEth} ETH`),
    createMetric("滑点设置", data.slippage?.forceMinOutZero ? "强制成交 / minOut=0" : data.slippage?.percent || ""),
    createMetric("状态", status.textContent)
  );
  resultEl.append(createSection("识别结果", summary));
  resultEl.append(
    createSection(
      isSell ? "卖出的代币" : "买到的代币",
      renderTokens(
        isSell ? data.sentTokens || [] : data.receivedTokens || [],
        isSell ? "没有识别到原卖家转出的 ERC20。" : "没有识别到直接转入原买家钱包的 ERC20。"
      )
    )
  );

  if (data.generated) {
    const generatedWrap = document.createElement("div");
    generatedWrap.className = "result";

    const confidence = document.createElement("span");
    confidence.className = `confidence ${data.generated.confidence}`.trim();
    confidence.textContent = `confidence: ${data.generated.confidence}`;
    generatedWrap.append(confidence);

    if (data.generated.approve) {
      generatedWrap.append(
        createCopyGroup("1. 授权 approve", [
          { label: "To", value: data.generated.approve.to },
          { label: "Value ETH", value: data.generated.approve.valueEth },
          { label: "Value Wei", value: data.generated.approve.valueWei },
          { label: "Data", value: data.generated.approve.data, tall: true }
        ])
      );
    }

    generatedWrap.append(
      createCopyGroup(data.generated.approve ? "2. 卖出 swap" : isSell ? "卖出 swap" : "买入 swap", [
        { label: "To", value: data.generated.to },
        { label: "Value ETH", value: data.generated.valueEth },
        { label: "Value Wei", value: data.generated.valueWei },
        { label: "Data", value: data.generated.data, tall: true }
      ])
    );
    resultEl.append(createSection("生成交易", generatedWrap));

    if (data.generated.changes?.length) {
      resultEl.append(createSection("已修改", createList(data.generated.changes, "change-list")));
    }
    if (data.generated.warnings?.length) {
      resultEl.append(createSection("风险提示", createList(data.generated.warnings, "warning-list")));
    }
  } else {
    const warning = createList(["填入你的钱包地址后，会生成可复制的 To / Value / Data。"], "warning-list");
    resultEl.append(createSection("生成交易", warning));
  }

  if (data.notes?.length) {
    resultEl.append(createSection("备注", createList(data.notes, "warning-list")));
  }

  loadingState.hidden = true;
  submitButton.disabled = false;
  submitButton.textContent = "解析并生成";
  setView("result");
}

function renderError(error, details) {
  resultEl.innerHTML = "";
  setFormStatus(error || "解析失败", "error");
  const box = document.createElement("div");
  box.className = "error-box";
  box.textContent = details ? `${error}: ${details}` : error;
  resultEl.append(box);
  submitButton.disabled = false;
  submitButton.textContent = "解析并生成";
  setView("result");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const tradeType = getTradeType();
  const txHash = extractTxHash(formData.get("txHash"));
  const walletAddress = extractAddress(formData.get("buyerAddress"));
  const rawTx = String(formData.get("txHash") || "").trim();
  const rawAddress = String(formData.get("buyerAddress") || "").trim();

  if (!txHash) {
    renderError("交易哈希不完整", "请粘贴完整 tx，格式是 0x + 64 位十六进制；也可以直接粘 Etherscan 交易链接。");
    return;
  }

  if (rawAddress && !walletAddress) {
    renderError("钱包地址不完整", "钱包地址格式应该是 0x + 40 位十六进制。");
    return;
  }

  const payload = {
    tradeType,
    txHash,
    walletAddress,
    tradeAmount: String(formData.get("tradeAmount") || "").trim(),
    slippagePercent: String(formData.get("slippagePercent") || "").trim(),
    forceMinOutZero: formData.get("forceMinOutZero") === "on"
  };

  showLoading(true);

  try {
    const data = await analyzeTransaction(payload);
    renderResult(data);
  } catch (err) {
    if (err && err.name === "AbortError") {
      renderError("请求超时", "这次 RPC 没回，重新点一次。");
      return;
    }
    renderError("请求失败", err instanceof Error ? err.message : String(err));
  }
});

for (const input of form.querySelectorAll("input[name='tradeType']")) {
  input.addEventListener("change", updateModeCopy);
}

updateModeCopy();
